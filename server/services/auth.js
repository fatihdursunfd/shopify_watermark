import { syncSubscriptionStatus } from './billing.js';

/**
 * Checks the status of the authenticated session.
 * Performs a background sync of the subscription status if the session is valid.
 * 
 * @param {Object} session - The Shopify session object
 * @returns {Promise<Object>} The authentication status object
 */
export async function checkAuthStatus(session) {
    if (!session) {
        return {
            ok: false,
            authenticated: false,
            message: 'No session found'
        };
    }

    try {
        console.log(`[Auth] Status Check OK: ${session.shop}`);

        // Self-healing: Sync subscription on auth check (Fire & Forget)
        if (session.shop && session.accessToken) {
            syncSubscriptionStatus(session.shop, session.accessToken)
                .catch(err => console.error(`[Auth] Sync failed: ${err.message}`));
        }

        return {
            ok: true,
            authenticated: true,
            shop: session.shop,
            hasAccessToken: Boolean(session.accessToken)
        };
    } catch (e) {
        console.error('[AuthService] Status check error:', e);
        throw new Error(e.message);
    }
}
