import { Session } from "@shopify/shopify-api";
import {
    storeSessionToDB,
    loadSessionFromDB,
    deleteSessionFromDB,
    deleteSessionsFromDB,
    findSessionsByShopFromDB
} from "./repositories/sessionRepository.js";

export class PostgresSessionStorage {
    // Constructor no longer needs pool, as repositories use global pool
    constructor(pool) {
        // Kept for compatibility but unused
    }

    async storeSession(session) {
        const s = session.toObject();
        const params = [
            s.id,
            s.shop,
            s.state ?? null,
            !!s.isOnline,
            s.scope ?? null,
            s.expires ? new Date(s.expires) : null,
            s.accessToken ?? null,
            s.onlineAccessInfo ? JSON.stringify(s.onlineAccessInfo) : null,
        ];
        return await storeSessionToDB(params);
    }

    async loadSession(id) {
        const row = await loadSessionFromDB(id);
        if (!row) return undefined;

        return new Session({
            id: row.id,
            shop: row.shop,
            state: row.state ?? "",
            isOnline: row.is_online,
            scope: row.scope ?? "",
            expires: row.expires ? new Date(row.expires) : undefined,
            accessToken: row.access_token ?? "",
            onlineAccessInfo: row.online_access_info
                ? JSON.parse(row.online_access_info)
                : undefined,
        });
    }

    async deleteSession(id) {
        return await deleteSessionFromDB(id);
    }

    async deleteSessions(ids) {
        if (!ids?.length) return true;
        return await deleteSessionsFromDB(ids);
    }

    async findSessionsByShop(shop) {
        const rows = await findSessionsByShopFromDB(shop);

        return rows.map((row) =>
            new Session({
                id: row.id,
                shop: row.shop,
                state: row.state ?? "",
                isOnline: row.is_online,
                scope: row.scope ?? "",
                expires: row.expires ? new Date(row.expires) : undefined,
                accessToken: row.access_token ?? "",
                onlineAccessInfo: row.online_access_info ?? undefined,
            })
        );
    }
}