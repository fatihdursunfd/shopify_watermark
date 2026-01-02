import { graphqlRequest } from '../utils/shopify-client.js';
import { upsertShopSubscription, getShopSubscription } from '../db/repositories/subscriptionRepository.js';
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS, ERROR_MESSAGES, LOG_MESSAGES } from '../constants/index.js';
import { PLAN_CONFIG } from '../constants/plans.js';
import { GRAPHQL_QUERIES } from '../graphql/queries.js';

/**
 * Retrieves the billing information for a shop, optionally syncing with Shopify.
 * Returns a view-model ready for the frontend.
 * 
 * @param {string} shop - The shop domain
 * @param {string} accessToken - The access token
 * @param {boolean} forceSync - Whether to force a sync with Shopify
 * @returns {Promise<Object>} Billing info object
 */
export async function getSubscriptionDetails(shop, accessToken, forceSync = false) {
  if (forceSync) {
    await syncSubscriptionStatus(shop, accessToken);
  }

  const subscription = await getShopSubscription(shop);

  return {
    currentPlan: subscription?.plan_type || SUBSCRIPTION_PLANS.FREE,
    status: subscription?.status || SUBSCRIPTION_STATUS.ACTIVE,
    plans: PLAN_CONFIG
  };
}

/**
 * Syncs the shop's subscription status from Shopify to the local DB.
 * Uses the offline access token if available or passed token.
 */
export async function syncSubscriptionStatus(shop, token) {
  const safeShop = shop.toLowerCase();

  console.log(`${LOG_MESSAGES.BILLING_SYNC_START} ${safeShop}...`);

  try {
    const data = await graphqlRequest(safeShop, token, GRAPHQL_QUERIES.GET_ACTIVE_SUBSCRIPTION);
    const activeSubs = data?.appInstallation?.activeSubscriptions || [];
    const installationId = data?.appInstallation?.id;

    const active = activeSubs.find(s => s.status === SUBSCRIPTION_STATUS.ACTIVE);

    let planKey = SUBSCRIPTION_PLANS.FREE;
    let status = SUBSCRIPTION_STATUS.ACTIVE;
    let subId = null;
    let periodEnd = null;

    if (active) {
      const name = active.name;
      const match = Object.values(PLAN_CONFIG).find(p => p.name === name);

      if (match) {
        planKey = match.key;
      } else {
        console.warn(`${ERROR_MESSAGES.UNKNOWN_PLAN} ${name}`);
      }

      subId = active.id;
      periodEnd = active.currentPeriodEnd;
    }

    await upsertShopSubscription(safeShop, planKey, subId, status, periodEnd, installationId);
    return { plan: planKey, subscriptionId: subId };

  } catch (e) {
    console.error(`${ERROR_MESSAGES.BILLING_SYNC_FAILED} ${e.message}`);
    return { plan: SUBSCRIPTION_PLANS.FREE }; // Safe default
  }
}