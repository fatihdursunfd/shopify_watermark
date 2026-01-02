import { SUBSCRIPTION_PLANS } from './index.js';

// Generic Plan Configuration
// Modify this to match your app's pricing tiers
export const PLAN_CONFIG = {
    [SUBSCRIPTION_PLANS.FREE]: {
        key: SUBSCRIPTION_PLANS.FREE,
        name: 'Basic', // Matches Shopify Plan Name
        price: 0,
        features: ['Basic Features']
    },
    [SUBSCRIPTION_PLANS.PRO]: {
        key: SUBSCRIPTION_PLANS.PRO,
        name: 'Pro', // Matches Shopify Plan Name
        price: 10.0,
        features: ['Pro Features', 'Priority Support']
    },
    // Add more tiers as needed (e.g. ENTERPRISE)
};
