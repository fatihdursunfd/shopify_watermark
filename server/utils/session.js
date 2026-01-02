import { shopify } from '../config/shopify-app.js';

/**
 * Retrieves the offline session for a shop.
 * Ideal for background jobs where a user session is not available.
 */
export async function getOfflineSession(shop) {
    const safeShop = (shop || '').toLowerCase();
    if (!safeShop) return null;

    try {
        const offlineId = shopify.api.session.getOfflineId(safeShop);
        return await shopify.config.sessionStorage.loadSession(offlineId);
    } catch (e) {
        console.error(`[Session] Error loading offline session for ${shop}:`, e);
        return null;
    }
}

/**
 * Retrieves the most appropriate access token for a shop.
 * Tries offline session first (preferred), then falls back to any available online session.
 */
export async function getAccessToken(shop) {
    if (!shop) return null;

    try {
        // Use findSessionsByShop from the configured storage
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop);

        // 1. Prefer OFFLINE session
        const offlineSession = sessions.find(s => s.isOnline === false);
        if (offlineSession?.accessToken) {
            return offlineSession.accessToken;
        }

        // 2. Fallback to any VALID online session
        const now = new Date();
        const activeSession = sessions.find(s => s.accessToken && (!s.expires || new Date(s.expires) > now));

        if (activeSession) {
            return activeSession.accessToken;
        }

    } catch (error) {
        console.error(`[Session] Error fetching token for ${shop}:`, error);
    }

    return null;
}
