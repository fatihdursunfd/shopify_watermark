import pool from '../index.js';
import {
    CREATE_ASSET,
    GET_ASSETS_BY_SHOP,
    SOFT_DELETE_ASSET
} from '../watermark-queries.js';

/**
 * Create a new watermark asset record
 */
export async function createWatermarkAsset(shop, fileName, fileUrl, fileSize, mimeType, shopifyFileId) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(CREATE_ASSET, [
            safeShop,
            fileName,
            fileUrl,
            fileSize,
            mimeType,
            shopifyFileId
        ]);

        console.log(`[WatermarkAssets] Created asset ${res.rows[0].id} for ${safeShop}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkAssets] Error creating asset for ${safeShop}:`, error.message);
        throw error;
    }
}

/**
 * Get all assets for a shop (excluding soft-deleted)
 */
export async function getWatermarkAssets(shop) {
    const safeShop = shop?.toLowerCase();

    if (!pool) {
        return [];
    }

    try {
        const res = await pool.query(GET_ASSETS_BY_SHOP, [safeShop]);
        return res.rows;
    } catch (error) {
        console.error(`[WatermarkAssets] Error fetching assets for ${safeShop}:`, error.message);
        return [];
    }
}

/**
 * Soft delete an asset
 */
export async function deleteWatermarkAsset(assetId) {
    if (!pool) {
        throw new Error('Database pool not available');
    }

    try {
        const res = await pool.query(SOFT_DELETE_ASSET, [assetId]);
        console.log(`[WatermarkAssets] Soft deleted asset ${assetId}`);
        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkAssets] Error deleting asset ${assetId}:`, error.message);
        throw error;
    }
}

/**
 * Get asset by ID
 */
export async function getWatermarkAssetById(assetId) {
    if (!pool) {
        return null;
    }

    try {
        const res = await pool.query(
            'SELECT * FROM watermark_assets WHERE id = $1 AND deleted_at IS NULL',
            [assetId]
        );

        if (res.rows.length === 0) {
            return null;
        }

        return res.rows[0];
    } catch (error) {
        console.error(`[WatermarkAssets] Error fetching asset ${assetId}:`, error.message);
        return null;
    }
}
