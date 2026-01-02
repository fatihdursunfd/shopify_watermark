import pool from '../index.js';
import { QUERIES } from '../queries.js';

export async function getShopSubscription(shop) {
    const safeShop = shop?.toLowerCase();

    // Default fallback if DB is down, to prevent app crash on critical paths
    if (!pool) return { plan_type: 'FREE', status: 'ACTIVE' };

    try {
        const res = await pool.query(QUERIES.GET_SUBSCRIPTION, [safeShop]);
        if (res.rows.length === 0) {
            console.log(`[DB] No subscription found for ${safeShop}, returning default FREE`);
            return { plan_type: 'FREE', status: 'ACTIVE' };
        }
        return res.rows[0];
    } catch (e) {
        console.error(`❌ DB Error (getShopSubscription) for ${safeShop}:`, e);
        return null;
    }
}

export async function upsertShopSubscription(shop, planType, subscriptionId, status, periodEnd, installationId = null) {
    const safeShop = shop?.toLowerCase();

    if (!pool) return;
    try {
        await pool.query(QUERIES.UPSERT_SUBSCRIPTION, [safeShop, planType, subscriptionId, status, periodEnd, installationId]);
    } catch (e) {
        console.error(`❌ DB Error (upsertShopSubscription) for ${safeShop}:`, e);
    }
}
