import { DeliveryMethod } from "@shopify/shopify-api";
import { cleanUpShopData } from "../db/repositories/cleanupRepository.js";
import { upsertShopSubscription } from "../db/repositories/subscriptionRepository.js";
import { log, err } from "../utils/logger.js";
import { PLAN_CONFIG } from "../constants/plans.js";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } from "../constants/index.js";

/**
 * Normalizes the plan name from webhook payload to our internal constant.
 * Fallbacks to FREE if no match found.
 */
function normalizePlanName(name) {
    if (!name) return SUBSCRIPTION_PLANS.FREE;

    // Exact Match (Preferred)
    const match = Object.values(PLAN_CONFIG).find(p => p.name === name);
    if (match) return match.key;

    // Fuzzy Match (Fallback for safety)
    const upperName = name.toUpperCase();
    if (upperName.includes('PRO')) return SUBSCRIPTION_PLANS.PRO;

    // Default
    return SUBSCRIPTION_PLANS.FREE;
}

function safeJson(body) {
    if (!body) return {};
    if (typeof body === "string") {
        try { return JSON.parse(body); } catch { return {}; }
    }
    return body;
}

const http = (callback) => ({
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/webhooks",
    callback,
});

const handlers = {
    /**
     * Triggered when a shop uninstalls the app.
     * We must clean up all their data immediately.
     */
    APP_UNINSTALLED: http(async (_topic, shop) => {
        log(`🔕 [Webhook] APP_UNINSTALLED for ${shop}`);
        try {
            await cleanUpShopData(shop);
        } catch (e) {
            err(`Cleanup failed for ${shop}: ${e.message}`);
        }
    }),

    /**
     * Triggered when shop details are updated (e.g. email change).
     */
    SHOP_UPDATE: http(async (_topic, shop) => {
        log(`🔔 [Webhook] SHOP_UPDATE for ${shop}`);
    }),

    /**
     * Triggered when a subscription charge is updated (Approved, Declined, Cancelled).
     */
    APP_SUBSCRIPTIONS_UPDATE: http(async (_topic, shop, body) => {
        log(`🔔 [Webhook] APP_SUBSCRIPTIONS_UPDATE for ${shop}`);
        try {
            const payload = safeJson(body);
            // Handling different payload structures (raw vs wrapped)
            const subscription = payload?.app_subscription || payload?.subscription || payload;

            const subId = subscription?.admin_graphql_api_id || subscription?.id || null;
            const planName = subscription?.name || "";
            const status = subscription?.status || "";
            const currentPeriodEnd =
                subscription?.current_period_end ||
                subscription?.currentPeriodEnd ||
                subscription?.billing_on ||
                null;

            const internalPlan = normalizePlanName(planName);
            const internalStatus = status ? String(status).toUpperCase() : SUBSCRIPTION_STATUS.PENDING;

            if (shop && subId) {
                await upsertShopSubscription(shop, internalPlan, subId, internalStatus, currentPeriodEnd);
                log(`✅ Subscription synced for ${shop}: ${internalPlan} (${internalStatus})`);
            } else {
                log(`⚠️ Subscription update missing shop/subId (shop=${shop}, subId=${subId})`);
            }
        } catch (e) {
            err(`Subscription update handler failed: ${e.message}`);
        }
    }),

    // GDPR / Mandatory Privacy Webhooks
    // Note: These usually don't send a body in the HTTP request in the same way, 
    // but the library handles the handshake. The logic here is just logging.

    CUSTOMERS_DATA_REQUEST: http(async (_topic, shop) => {
        log(`🔒 [GDPR] CUSTOMERS_DATA_REQUEST for ${shop}`);
    }),
    CUSTOMERS_REDACT: http(async (_topic, shop) => {
        log(`🔒 [GDPR] CUSTOMERS_REDACT for ${shop}`);
    }),
    SHOP_REDACT: http(async (_topic, shop) => {
        log(`🔒 [GDPR] SHOP_REDACT for ${shop}`);
    }),
};

export { handlers };