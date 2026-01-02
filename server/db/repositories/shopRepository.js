import pool from '../index.js';
import { QUERIES } from '../queries.js';

export async function saveShopToken(shop, accessToken) {
    if (!pool) return;
    try {
        await pool.query(QUERIES.SAVE_TOKEN, [shop, accessToken]);
    } catch (e) {
        console.error(`❌ DB Error (saveShopToken): ${e.message}`);
    }
}

export async function getShopToken(shop) {
    if (!pool) return null;
    try {
        // 1. Try dedicated shop_tokens table first
        const res = await pool.query(QUERIES.GET_TOKEN, [shop]);
        if (res.rows[0]?.access_token) {
            return res.rows[0].access_token;
        }

        // 2. Fallback: Try to find an offline session in shopify_sessions
        // offline sessions usually have an ID like 'offline_shop.myshopify.com'
        const sessionRes = await pool.query(
            "SELECT access_token FROM shopify_sessions WHERE shop = $1 AND is_online = false LIMIT 1",
            [shop]
        );

        if (sessionRes.rows[0]?.access_token) {
            console.log(`[ShopRepo] Found fallback offline token for ${shop}`);
            return sessionRes.rows[0].access_token;
        }

        // 3. Last resort: Any valid token for this shop
        const lastRes = await pool.query(
            "SELECT access_token FROM shopify_sessions WHERE shop = $1 AND access_token IS NOT NULL ORDER BY expires DESC LIMIT 1",
            [shop]
        );

        return lastRes.rows[0]?.access_token || null;
    } catch (e) {
        console.error(`❌ DB Error (getShopToken): ${e.message}`);
        return null;
    }
}
