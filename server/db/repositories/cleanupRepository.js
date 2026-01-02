import pool from '../index.js';
import { QUERIES } from '../queries.js';

/**
 * Cleanup all data for a shop when App Uninstalled
 */
export async function cleanUpShopData(shop) {
    if (!pool || !shop) return;
    const safeShop = shop.toLowerCase();
    console.log(`🧹 Cleaning up ALL data for shop: ${safeShop}`);

    try {
        await pool.query(QUERIES.CLEANUP_SHOP, [safeShop]);
        console.log(`✅ Cleanup completed for ${safeShop}`);
    } catch (e) {
        console.error(`❌ Cleanup failed for ${safeShop}:`, e);
    }
}
