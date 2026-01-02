import { generatePreview } from './imageEngine.js';
import { getWatermarkSettings } from '../../db/repositories/watermarkSettingsRepository.js';

/**
 * Generate watermark preview for a sample image
 */
export async function createPreview(shop, sampleImageUrl, customSettings = null) {
    try {
        // Get settings (use custom if provided, otherwise fetch from DB)
        const settings = customSettings || await getWatermarkSettings(shop);

        // Validate settings
        if (!settings.logo_url && !settings.text_content) {
            throw new Error('No watermark configured. Please add a logo or text.');
        }

        // Generate preview
        const preview = await generatePreview(sampleImageUrl, settings);

        return {
            success: true,
            preview: preview.base64,
            width: preview.width,
            height: preview.height,
            settings: {
                hasLogo: !!settings.logo_url,
                hasText: !!settings.text_content,
                position: settings.logo_url ? settings.logo_position : settings.text_position,
                mobileEnabled: settings.mobile_enabled
            }
        };
    } catch (error) {
        console.error('[PreviewService] Error creating preview:', error.message);
        throw error;
    }
}

/**
 * Get a sample product image from shop
 * Fetches first product with image for preview
 */
export async function getSampleImage(shop, accessToken) {
    // TODO: Implement in next step with Shopify GraphQL
    // For now, return a placeholder
    return 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';
}
