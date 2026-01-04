import pool from '../index.js';
import {
    GET_SETTINGS_BY_SHOP,
    UPSERT_SETTINGS
} from '../watermark-queries.js';
import { WATERMARK_DEFAULTS } from '../../constants/watermark.js';

/**
 * Get watermark settings for a shop
 * Returns default settings if none exist
 */
export async function getWatermarkSettings(shop) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        console.error('[WatermarkSettings] DB pool not available');
        return getDefaultSettings(safeShop);
    }

    try {
        const res = await pool.query(GET_SETTINGS_BY_SHOP, [safeShop]);

        if (res.rows.length === 0) {
            console.log(`[WatermarkSettings] No settings found for ${safeShop}, returning defaults`);
            return getDefaultSettings(safeShop);
        }

        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkSettings] Error fetching settings for ${safeShop}:`, error.message);
        return getDefaultSettings(safeShop);
    }
}

/**
 * Upsert watermark settings for a shop
 */
export async function upsertWatermarkSettings(shop, settings) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        console.error('[WatermarkSettings] DB pool not available');
        return null;
    }

    try {
        const res = await pool.query(UPSERT_SETTINGS, [
            safeShop,
            settings.logo_url || null,
            settings.logo_position || WATERMARK_DEFAULTS.LOGO_POSITION,
            settings.logo_opacity ?? WATERMARK_DEFAULTS.LOGO_OPACITY,
            settings.logo_margin ?? WATERMARK_DEFAULTS.LOGO_MARGIN,
            settings.logo_scale ?? WATERMARK_DEFAULTS.LOGO_SCALE,
            settings.logo_rotation ?? 0,
            settings.logo_x ?? 0,
            settings.logo_y ?? 0,
            settings.text_content || null,
            settings.text_font || WATERMARK_DEFAULTS.TEXT_FONT,
            settings.text_size ?? WATERMARK_DEFAULTS.TEXT_SIZE,
            settings.text_color || WATERMARK_DEFAULTS.TEXT_COLOR,
            settings.text_position || WATERMARK_DEFAULTS.TEXT_POSITION,
            settings.text_opacity ?? WATERMARK_DEFAULTS.TEXT_OPACITY,
            settings.text_outline ?? WATERMARK_DEFAULTS.TEXT_OUTLINE,
            settings.text_outline_color || WATERMARK_DEFAULTS.TEXT_OUTLINE_COLOR,
            settings.text_rotation ?? 0,
            settings.text_x ?? 0,
            settings.text_y ?? 0,
            settings.use_custom_placement ?? false,
            settings.mobile_enabled ?? WATERMARK_DEFAULTS.MOBILE_ENABLED,
            settings.mobile_position || WATERMARK_DEFAULTS.MOBILE_POSITION,
            settings.mobile_scale ?? WATERMARK_DEFAULTS.MOBILE_SCALE
        ]);

        console.log(`[WatermarkSettings] Settings saved for ${safeShop}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkSettings] Error upserting settings for ${safeShop}:`, error.message);
        throw error;
    }
}

/**
 * Get default settings for a shop
 */
function getDefaultSettings(shop) {
    return {
        shop,
        logo_url: null,
        logo_position: WATERMARK_DEFAULTS.LOGO_POSITION,
        logo_opacity: WATERMARK_DEFAULTS.LOGO_OPACITY,
        logo_margin: WATERMARK_DEFAULTS.LOGO_MARGIN,
        logo_scale: WATERMARK_DEFAULTS.LOGO_SCALE,
        logo_rotation: 0,
        logo_x: 0,
        logo_y: 0,
        text_content: null,
        text_font: WATERMARK_DEFAULTS.TEXT_FONT,
        text_size: WATERMARK_DEFAULTS.TEXT_SIZE,
        text_color: WATERMARK_DEFAULTS.TEXT_COLOR,
        text_position: WATERMARK_DEFAULTS.TEXT_POSITION,
        text_opacity: WATERMARK_DEFAULTS.TEXT_OPACITY,
        text_outline: WATERMARK_DEFAULTS.TEXT_OUTLINE,
        text_outline_color: WATERMARK_DEFAULTS.TEXT_OUTLINE_COLOR,
        text_rotation: 0,
        text_x: 0,
        text_y: 0,
        use_custom_placement: false,
        mobile_enabled: WATERMARK_DEFAULTS.MOBILE_ENABLED,
        mobile_position: WATERMARK_DEFAULTS.MOBILE_POSITION,
        mobile_scale: WATERMARK_DEFAULTS.MOBILE_SCALE
    };
}
