import { shopify } from '../config/shopify-app.js';
import { log } from './logger.js';
import { Session } from '@shopify/shopify-api';

/**
 * 🛡️ Ultimate Safe GraphQL Request Wrapper (Principal-Level)
 * 
 * Resilient to:
 * - Cost-based throttling (Leaky Bucket)
 * - Network throttling (HTTP 429)
 * - Edge-node inconsistencies (Empty body, [], missing data)
 * - Valid data: null responses
 * 
 * Decision Logic:
 * - data !== undefined     -> RETURN (Success)
 * - errors + Throttled     -> RETRY (Cost Logic)
 * - errors + Functional    -> THROW (Fatal)
 * - Empty Body / []        -> RETRY (Transient)
 * - Missing Data key       -> RETRY (Transient)
 * - Network 429            -> RETRY (Retry-After)
 * 
 * @param {string} shop - The shop domain
 * @param {string} token - The access token
 * @param {string} query - The GraphQL query
 * @param {Object} variables - Query variables
 * @returns {Promise<Object>} The data object (or throws if fatal)
 */
export async function graphqlRequest(shop, token, query, variables = {}) {
    if (!token) throw new Error('graphqlRequest: Missing token');

    const accessToken = token.toString().replace(/['"]/g, '').trim();

    // Persistent Session for Client
    const session = new Session({
        id: `offline_${shop}`,
        shop,
        state: 'offline_state',
        isOnline: false,
        accessToken
    });

    const client = new shopify.api.clients.Graphql({ session });

    const MAX_ATTEMPTS = 10;
    const BASE_WAIT_MS = 1000;

    let lastRequestedCost = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            // 🛑 Disable internal retries: We own the lifecycle
            const response = await client.request(query, {
                variables,
                retries: 0
            });

            // Handle potential edge-case responses (Transient failures)
            // e.g. Shopify edge node returns [] or null body under load
            let body = response.body;

            // 0. Compatibility Check: Some client versions/responses put data/errors on root
            if (!body && (response.data || response.errors)) {
                body = response;
            }

            // 1. Transient Check: Invalid Body Structure
            if (!body || (Array.isArray(body) && body.length === 0)) {
                log(`⚠️ Transient GraphQL Response (Empty/Invalid Body). Retrying... (Attempt ${attempt})`);
                throw new Error('TRANSIENT_EMPTY_BODY');
            }

            const errors = body.errors;
            const cost = body.extensions?.cost;

            // 2. Soft Throttling (200 OK + "Throttled" error)
            const isThrottled = errors?.some(e =>
                e.message?.toLowerCase().includes('throttled') ||
                e.extensions?.code === 'THROTTLED'
            );

            if (isThrottled) {
                let waitTime = BASE_WAIT_MS * Math.pow(2, attempt - 1); // Fallback

                if (cost?.throttleStatus) {
                    const { requestedQueryCost, throttleStatus } = cost;
                    const { currentlyAvailable, restoreRate } = throttleStatus;

                    const costNeeded = requestedQueryCost || lastRequestedCost || 50;
                    lastRequestedCost = costNeeded;

                    const deficit = costNeeded - currentlyAvailable;
                    // 🧮 Precise Wait Calculation
                    if (deficit > 0 && restoreRate > 0) {
                        const secondsToWait = Math.ceil(deficit / restoreRate);
                        waitTime = (secondsToWait * 1000) + 100; // +100ms jitter
                        log(`📉 Cost limit hit. Need ${costNeeded}, have ${currentlyAvailable}. Waiting ${waitTime}ms.`);
                    }
                } else {
                    log(`⏳ Throttled (Unknown Cost). Waiting ${waitTime}ms (Attempt ${attempt}).`);
                }

                // Check cancellation before waiting
                if (variables?.checkCancelled) variables.checkCancelled();

                await new Promise(r => setTimeout(r, waitTime));

                // Check cancellation after waiting
                if (variables?.checkCancelled) variables.checkCancelled();

                continue; // Retry
            }

            // 3. Functional Errors (Fatal)
            if (errors) {
                const msg = errors.map(e => e.message).join(' | ');
                log(`🔴 GraphQL Functional Error: ${msg}`);
                throw new Error(msg);
            }

            // 4. Valid Data (Success)
            // Accepts null as valid (e.g. "productByHandle" -> null)
            if (body.data !== undefined) {
                return body.data;
            }

            // 5. Missing Data Key (Transient)
            // Body exists but no 'data' and no 'errors'. Likely incomplete upstream response.
            log(`⚠️ GraphQL Response Missing 'data' key. Retrying... (Attempt ${attempt})`);
            throw new Error('TRANSIENT_MISSING_DATA');

        } catch (error) {
            // 🛡️ Error Handling & Retry Logic

            // Cleanly handle cancellation without fatal logging
            if (error.message === 'IMPORT_CANCELLED') {
                throw error;
            }

            // Classify Retryable Errors
            const isTransient =
                error.message === 'TRANSIENT_EMPTY_BODY' ||
                error.message === 'TRANSIENT_MISSING_DATA';

            const isNetworkThrottled =
                error?.response?.code === 429 ||
                error?.message?.toLowerCase().includes('throttled');

            const isNetworkError =
                ['ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes(error?.code);

            // Determine if we should retry
            if ((isTransient || isNetworkThrottled || isNetworkError) && attempt < MAX_ATTEMPTS) {
                let waitTime = BASE_WAIT_MS * Math.pow(2, attempt); // Exponential Backoff

                // Handle Retry-After Header
                if (isNetworkThrottled) {
                    const retryAfter = error?.response?.headers?.get?.('Retry-After');
                    if (retryAfter) {
                        waitTime = (parseInt(retryAfter, 10) * 1000) + 500;
                    }
                    // Minimum wait for network throttle to be safe
                    waitTime = Math.max(waitTime, 2000);
                    log(`⏳ Network Throttle/429. Waiting ${waitTime}ms...`);
                } else if (isTransient) {
                    log(`🔄 Transient Error (${error.message}). Waiting ${waitTime}ms...`);
                } else {
                    log(`📡 Network Error (${error.code}). Waiting ${waitTime}ms...`);
                }

                // Check cancellation before waiting
                if (variables?.checkCancelled) variables.checkCancelled();

                await new Promise(r => setTimeout(r, waitTime));

                // Check cancellation after waiting
                if (variables?.checkCancelled) variables.checkCancelled();

                continue;
            }

            // Fatal: No more retries or non-retryable error
            if (!error.message.includes('Functional Error')) {
                // Log detail only if not already logged as functional
                log(`❌ GraphQL Request Failed Final: ${error.message}`);
                if (error.response?.errors) {
                    log(`   Details: ${JSON.stringify(error.response.errors)}`);
                }
            }
            throw error;
        }
    }

    throw new Error(`GraphQL request exhausted max retries (${MAX_ATTEMPTS}).`);
}