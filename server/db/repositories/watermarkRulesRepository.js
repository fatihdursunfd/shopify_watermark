import pool from '../index.js';
import {
    CREATE_RULE,
    GET_RULES_BY_SHOP,
    GET_ENABLED_RULES_BY_SHOP,
    UPDATE_RULE,
    DELETE_RULE
} from '../watermark-queries.js';

/**
 * Create a new automation rule
 */
export async function createWatermarkRule(shop, ruleName, enabled, triggerType, collectionIds, tagFilters, settingsSnapshot) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(CREATE_RULE, [
            safeShop,
            ruleName,
            enabled,
            triggerType,
            collectionIds || [],
            tagFilters || [],
            JSON.stringify(settingsSnapshot)
        ]);

        console.log(`[WatermarkRules] Created rule ${res.rows[0].id} for ${safeShop}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkRules] Error creating rule for ${safeShop}:`, error.message);
        throw error;
    }
}

/**
 * Get all rules for a shop
 */
export async function getWatermarkRules(shop) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_RULES_BY_SHOP, [safeShop]);
        return res.rows;
    } catch (error) {
        console.error(`[WatermarkRules] Error fetching rules for ${safeShop}:`, error.message);
        return [];
    }
}

/**
 * Get enabled rules for a shop
 */
export async function getEnabledWatermarkRules(shop) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_ENABLED_RULES_BY_SHOP, [safeShop]);
        return res.rows;
    } catch (error) {
        console.error(`[WatermarkRules] Error fetching enabled rules for ${safeShop}:`, error.message);
        return [];
    }
}

/**
 * Update a rule
 */
export async function updateWatermarkRule(ruleId, ruleName, enabled, triggerType, collectionIds, tagFilters, settingsSnapshot) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(UPDATE_RULE, [
            ruleId,
            ruleName,
            enabled,
            triggerType,
            collectionIds || [],
            tagFilters || [],
            JSON.stringify(settingsSnapshot)
        ]);

        console.log(`[WatermarkRules] Updated rule ${ruleId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkRules] Error updating rule ${ruleId}:`, error.message);
        throw error;
    }
}

/**
 * Delete a rule
 */
export async function deleteWatermarkRule(ruleId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(DELETE_RULE, [ruleId]);
        console.log(`[WatermarkRules] Deleted rule ${ruleId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkRules] Error deleting rule ${ruleId}:`, error.message);
        throw error;
    }
}

/**
 * Toggle rule enabled status
 */
export async function toggleRuleEnabled(ruleId, enabled) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(
            'UPDATE watermark_rules SET enabled = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [ruleId, enabled]
        );

        console.log(`[WatermarkRules] Toggled rule ${ruleId} enabled to ${enabled}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkRules] Error toggling rule ${ruleId}:`, error.message);
        throw error;
    }
}
