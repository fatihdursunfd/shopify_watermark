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
        const res = await pool.query(QUERIES.GET_TOKEN, [shop]);
        return res.rows[0]?.access_token || null;
    } catch (e) {
        console.error(`❌ DB Error (getShopToken): ${e.message}`);
        return null;
    }
}
