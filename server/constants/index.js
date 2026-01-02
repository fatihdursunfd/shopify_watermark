export const SUBSCRIPTION_PLANS = {
    FREE: 'FREE',
    PRO: 'PRO',
    // Add more plans here
};

export const SUBSCRIPTION_STATUS = {
    ACTIVE: 'ACTIVE',
    PENDING: 'PENDING',
    EXPIRED: 'EXPIRED',
    CANCELLED: 'CANCELLED',
    FROZEN: 'FROZEN',
    DECLINED: 'DECLINED'
};

export const ERROR_MESSAGES = {
    BILLING_SYNC_FAILED: '[Billing] Sync failed:',
    UNKNOWN_PLAN: '[Billing] Unknown plan name from Shopify:'
};

export const LOG_MESSAGES = {
    BILLING_SYNC_START: '[Billing] Syncing status for',
};
