import pool from '../index.js';
import { QUERIES } from '../queries.js';

export async function storeSessionToDB(params) {
    if (!pool) return false;
    try {
        await pool.query(QUERIES.STORE_SESSION, params);
        return true;
    } catch (e) {
        console.error('[SessionRepo] Store Error:', e);
        return false;
    }
}

export async function loadSessionFromDB(id) {
    if (!pool) return undefined;
    try {
        const { rows } = await pool.query(QUERIES.LOAD_SESSION, [id]);
        return rows[0];
    } catch (e) {
        console.error('[SessionRepo] Load Error:', e);
        return undefined;
    }
}

export async function deleteSessionFromDB(id) {
    if (!pool) return false;
    try {
        await pool.query(QUERIES.DELETE_SESSION, [id]);
        return true;
    } catch (e) {
        console.error('[SessionRepo] Delete Error:', e);
        return false;
    }
}

export async function deleteSessionsFromDB(ids) {
    if (!pool || !ids?.length) return false;
    try {
        await pool.query(QUERIES.DELETE_SESSIONS, [ids]);
        return true;
    } catch (e) {
        console.error('[SessionRepo] Delete Many Error:', e);
        return false;
    }
}

export async function findSessionsByShopFromDB(shop) {
    if (!pool) return [];
    try {
        const { rows } = await pool.query(QUERIES.FIND_SESSIONS_BY_SHOP, [shop]);
        return rows;
    } catch (e) {
        console.error('[SessionRepo] Find Sessions Error:', e);
        return [];
    }
}
