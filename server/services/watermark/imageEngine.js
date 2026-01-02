import sharp from 'sharp';
import axios from 'axios';
import crypto from 'crypto';
import {
    IMAGE_LIMITS,
    getPositionCoordinates,
    shouldUseMobileProfile
} from '../../constants/watermark.js';

/**
 * Download image from URL
 */
export async function downloadImage(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: IMAGE_LIMITS.MAX_FILE_SIZE
        });

        return Buffer.from(response.data);
    } catch (error) {
        console.error(`[ImageEngine] Error downloading image from ${url}:`, error.message);
        throw new Error(`Failed to download image: ${error.message}`);
    }
}

/**
 * Generate SHA256 hash of image buffer
 */
export function generateImageHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate image buffer
 */
export async function validateImage(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();

        // Check format
        if (!['jpeg', 'png', 'webp'].includes(metadata.format)) {
            throw new Error(`Unsupported format: ${metadata.format}`);
        }

        // Check dimensions
        if (metadata.width > IMAGE_LIMITS.MAX_DIMENSION || metadata.height > IMAGE_LIMITS.MAX_DIMENSION) {
            throw new Error(`Image too large: ${metadata.width}x${metadata.height}px (max: ${IMAGE_LIMITS.MAX_DIMENSION}px)`);
        }

        if (metadata.width < IMAGE_LIMITS.MIN_DIMENSION || metadata.height < IMAGE_LIMITS.MIN_DIMENSION) {
            throw new Error(`Image too small: ${metadata.width}x${metadata.height}px (min: ${IMAGE_LIMITS.MIN_DIMENSION}px)`);
        }

        return metadata;
    } catch (error) {
        console.error('[ImageEngine] Image validation failed:', error.message);
        throw error;
    }
}

/**
 * Generate SVG text for text watermark
 */
function generateTextSVG(text, font, size, color, outlineColor, outline) {
    const escapedText = text.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case "'": return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });

    // Be more generous with dimensions to avoid clipping descenders and strokes
    const textWidth = Math.ceil(text.length * size * 1.0); // Increased multiplier
    const textHeight = Math.ceil(size * 1.6); // Increased multiplier

    let svg = `<svg width="${textWidth}" height="${textHeight}" viewBox="0 0 ${textWidth} ${textHeight}" xmlns="http://www.w3.org/2000/svg">`;

    if (outline) {
        // Outline/stroke with a bit more thickness for high contrast
        svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="none" stroke="${outlineColor}" stroke-width="4" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${escapedText}</text>`;
    }

    // Main text
    svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${escapedText}</text>`;
    svg += `</svg>`;

    return Buffer.from(svg);
}

/**
 * Apply logo watermark to image
 */
export async function applyLogoWatermark(imageBuffer, settings, metadata) {
    try {
        // Determine which profile to use
        const useMobile = settings.mobile_enabled && shouldUseMobileProfile(metadata.width, metadata.height);
        const position = useMobile ? settings.mobile_position : settings.logo_position;
        const scale = useMobile ? settings.mobile_scale : settings.logo_scale;
        const margin = settings.logo_margin;
        const opacity = settings.logo_opacity;

        // Download logo
        const logoBuffer = await downloadImage(settings.logo_url);

        // Load logo and get dimensions
        const logoMetadata = await sharp(logoBuffer).metadata();

        // Calculate watermark size based on scale
        const watermarkWidth = Math.floor(metadata.width * scale);
        const watermarkHeight = Math.floor((logoMetadata.height / logoMetadata.width) * watermarkWidth);

        // Resize logo
        let watermarkBuffer = await sharp(logoBuffer)
            .resize(watermarkWidth, watermarkHeight, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer();

        // Apply opacity if needed
        if (opacity < 1.0) {
            watermarkBuffer = await sharp(watermarkBuffer)
                .composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: {
                        width: 1,
                        height: 1,
                        channels: 4
                    },
                    tile: true,
                    blend: 'dest-in'
                }])
                .toBuffer();
        }

        // Calculate position
        const coords = getPositionCoordinates(
            position,
            metadata.width,
            metadata.height,
            watermarkWidth,
            watermarkHeight,
            margin
        );

        // Composite watermark onto image
        const result = await sharp(imageBuffer)
            .composite([{
                input: watermarkBuffer,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            }])
            .jpeg({ quality: 90 })
            .toBuffer();

        return result;
    } catch (error) {
        console.error('[ImageEngine] Error applying logo watermark:', error.message);
        throw error;
    }
}

/**
 * Apply text watermark to image
 */
export async function applyTextWatermark(imageBuffer, settings, metadata) {
    try {
        // Determine which profile to use
        const useMobile = settings.mobile_enabled && shouldUseMobileProfile(metadata.width, metadata.height);
        const position = useMobile ? settings.mobile_position : settings.text_position;
        const scale = useMobile ? settings.mobile_scale : 1.0;
        const margin = 20; // Fixed margin for text
        const opacity = settings.text_opacity;

        // Generate SVG text
        const textSVG = generateTextSVG(
            settings.text_content,
            settings.text_font,
            Math.floor(settings.text_size * scale),
            settings.text_color,
            settings.text_outline_color,
            settings.text_outline
        );

        // Convert SVG to PNG
        let watermarkBuffer = await sharp(textSVG)
            .png()
            .toBuffer();

        // Get watermark dimensions
        const watermarkMetadata = await sharp(watermarkBuffer).metadata();

        // Apply opacity if needed
        if (opacity < 1.0) {
            watermarkBuffer = await sharp(watermarkBuffer)
                .composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: {
                        width: 1,
                        height: 1,
                        channels: 4
                    },
                    tile: true,
                    blend: 'dest-in'
                }])
                .toBuffer();
        }

        // Calculate position
        const coords = getPositionCoordinates(
            position,
            metadata.width,
            metadata.height,
            watermarkMetadata.width,
            watermarkMetadata.height,
            margin
        );

        // Composite watermark onto image
        const result = await sharp(imageBuffer)
            .composite([{
                input: watermarkBuffer,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            }])
            .jpeg({ quality: 90 })
            .toBuffer();

        return result;
    } catch (error) {
        console.error('[ImageEngine] Error applying text watermark:', error.message);
        throw error;
    }
}

/**
 * Main function: Apply watermark based on settings
 */
export async function applyWatermark(imageUrl, settings) {
    try {
        console.log(`[ImageEngine] Processing image: ${imageUrl}`);

        // Download image
        const imageBuffer = await downloadImage(imageUrl);

        // Generate hash
        const imageHash = generateImageHash(imageBuffer);

        // Validate image
        const metadata = await validateImage(imageBuffer);

        console.log(`[ImageEngine] Image metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

        let processedBuffer = imageBuffer;

        // Apply logo watermark if configured
        if (settings.logo_url) {
            console.log('[ImageEngine] Applying logo watermark...');
            processedBuffer = await applyLogoWatermark(processedBuffer, settings, metadata);
        }

        // Apply text watermark if configured
        if (settings.text_content) {
            console.log('[ImageEngine] Applying text watermark...');
            processedBuffer = await applyTextWatermark(processedBuffer, settings, metadata);
        }

        console.log('[ImageEngine] Watermark applied successfully');

        return {
            buffer: processedBuffer,
            hash: imageHash,
            metadata: {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format
            }
        };
    } catch (error) {
        console.error('[ImageEngine] Error processing image:', error.message);
        throw error;
    }
}

/**
 * Resize image for preview (smaller size for faster processing)
 */
export async function generatePreview(imageUrl, settings, maxWidth = 800) {
    try {
        // Download image
        const imageBuffer = await downloadImage(imageUrl);

        // Resize for preview
        const resizedBuffer = await sharp(imageBuffer)
            .resize(maxWidth, null, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .toBuffer();

        // Get metadata of resized image
        const metadata = await sharp(resizedBuffer).metadata();

        // Apply watermark to resized image
        let processedBuffer = resizedBuffer;

        if (settings.logo_url) {
            processedBuffer = await applyLogoWatermark(processedBuffer, settings, metadata);
        }

        if (settings.text_content) {
            processedBuffer = await applyTextWatermark(processedBuffer, settings, metadata);
        }

        // Convert to base64 for easy display
        const base64 = processedBuffer.toString('base64');

        return {
            base64: `data:image/jpeg;base64,${base64}`,
            width: metadata.width,
            height: metadata.height
        };
    } catch (error) {
        console.error('[ImageEngine] Error generating preview:', error.message);
        throw error;
    }
}
