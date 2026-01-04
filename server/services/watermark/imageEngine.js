import sharp from 'sharp';
import axios from 'axios';
import crypto from 'crypto';
import {
    IMAGE_LIMITS,
    getPositionCoordinates,
    shouldUseMobileProfile
} from '../../constants/watermark.js';

// 🚀 Optimize Sharp for memory-constrained environments (like 500MB)
sharp.cache(false); // Disable internal cache to free memory immediately
sharp.concurrency(1); // Limit threads per instance to prevent memory spikes

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
function generateTextSVG(text, font, size, color, outlineColor, outline, resFactor = 1, settings = {}) {
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

    // SVG text with rotation support
    // Increase canvas even more if rotated to avoid clipping the corners
    const rotation = settings?.text_rotation || 0;
    const isRotated = rotation !== 0;

    // For rotated text, we need a larger canvas to fit the diagonal
    const canvasWidth = isRotated ? Math.ceil(textWidth * 1.5) : textWidth;
    const canvasHeight = isRotated ? Math.ceil(textHeight * 1.5 + textWidth * Math.abs(Math.sin(rotation * Math.PI / 180))) : textHeight;

    let svg = `<svg width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" xmlns="http://www.w3.org/2000/svg">`;

    const transform = isRotated ? ` transform="rotate(${rotation}, ${canvasWidth / 2}, ${canvasHeight / 2})"` : '';

    if (outline) {
        // Outline/stroke with a bit more thickness for high contrast, scaled by resFactor
        const strokeWidth = Math.max(2, Math.floor(4 * resFactor));
        svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="none" stroke="${outlineColor}" stroke-width="${strokeWidth}" text-anchor="middle" dominant-baseline="middle" font-weight="bold"${transform}>${escapedText}</text>`;
    }

    // Main text
    svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="middle" font-weight="bold"${transform}>${escapedText}</text>`;
    svg += `</svg>`;

    return Buffer.from(svg);
}

/**
 * Apply logo watermark to image
 */
export async function applyLogoWatermark(imageBuffer, settings, metadata, preloadedLogoBuffer = null) {
    try {
        // Determine which profile to use
        const useMobile = settings.mobile_enabled && shouldUseMobileProfile(metadata.width, metadata.height);
        const position = useMobile ? settings.mobile_position : settings.logo_position;
        const scale = useMobile ? settings.mobile_scale : settings.logo_scale;
        const margin = settings.logo_margin;
        const opacity = settings.logo_opacity;

        // Use preloaded logo or download it
        const logoBuffer = preloadedLogoBuffer || await downloadImage(settings.logo_url);

        // Load logo and get dimensions
        const logoMetadata = await sharp(logoBuffer).metadata();

        // Calculate watermark size based on scale
        const watermarkWidth = Math.floor(metadata.width * scale);
        const watermarkHeight = Math.floor((logoMetadata.height / logoMetadata.width) * watermarkWidth);

        // Resize and Rotate logo
        let watermarkBuffer = await sharp(logoBuffer)
            .resize(watermarkWidth, watermarkHeight, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .rotate(settings.logo_rotation || 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        // Load rotated dimensions
        const rotatedMetadata = await sharp(watermarkBuffer).metadata();
        const finalWidth = rotatedMetadata.width;
        const finalHeight = rotatedMetadata.height;

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

        // Base resolution for scaling (matches preview maxWidth)
        const baseRes = 800;
        const resFactor = metadata.width / baseRes;
        const scaledMargin = Math.floor(margin * resFactor);

        // Calculate position
        const coords = getPositionCoordinates(
            position,
            metadata.width,
            metadata.height,
            finalWidth,
            finalHeight,
            scaledMargin,
            settings.use_custom_placement ? { x: settings.logo_x, y: settings.logo_y } : null
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

        // Base resolution for scaling (matches preview maxWidth)
        const baseRes = 800;
        const resFactor = metadata.width / baseRes;
        const scaledSize = Math.floor(settings.text_size * scale * resFactor);
        const scaledMargin = Math.floor(margin * resFactor);

        // Generate SVG text
        const textSVG = generateTextSVG(
            settings.text_content,
            settings.text_font,
            scaledSize,
            settings.text_color,
            settings.text_outline_color,
            settings.text_outline,
            resFactor,
            settings
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
            scaledMargin,
            settings.use_custom_placement ? { x: settings.text_x, y: settings.text_y } : null
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
 * Main function: Apply watermark based on settings (OPTIMIZED SINGLE-PASS)
 */
export async function applyWatermark(imageUrl, settings, preloadedLogoBuffer = null) {
    try {
        console.log(`[ImageEngine] Processing image (Single-Pass): ${imageUrl}`);

        // 1. Download image
        const imageBuffer = await downloadImage(imageUrl);
        const imageHash = generateImageHash(imageBuffer);
        const metadata = await validateImage(imageBuffer);

        // 2. Determine Profile (Mobile/Desktop)
        const useMobile = settings.mobile_enabled && shouldUseMobileProfile(metadata.width, metadata.height);

        // 3. Prepare Pipeline
        const compositeLayers = [];
        const baseRes = 800;
        const resFactor = metadata.width / baseRes;

        // --- LAYER A: LOGO ---
        if (settings.logo_url) {
            const logoBuffer = preloadedLogoBuffer || await downloadImage(settings.logo_url);
            const logoMetadata = await sharp(logoBuffer).metadata();

            const scale = useMobile ? settings.mobile_scale : settings.logo_scale;
            const position = useMobile ? settings.mobile_position : settings.logo_position;
            const opacity = settings.logo_opacity;

            const watermarkWidth = Math.floor(metadata.width * scale);
            const watermarkHeight = Math.floor((logoMetadata.height / logoMetadata.width) * watermarkWidth);

            let processedLogo = sharp(logoBuffer)
                .resize(watermarkWidth, watermarkHeight, { fit: 'inside', withoutEnlargement: true })
                .rotate(settings.logo_rotation || 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

            if (opacity < 1.0) {
                processedLogo = processedLogo.composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true, blend: 'dest-in'
                }]);
            }

            const finalLogoBuffer = await processedLogo.toBuffer();
            const finalLogoMeta = await sharp(finalLogoBuffer).metadata();
            const scaledMargin = Math.floor(settings.logo_margin * resFactor);

            const coords = getPositionCoordinates(
                position, metadata.width, metadata.height,
                finalLogoMeta.width, finalLogoMeta.height,
                scaledMargin,
                settings.use_custom_placement ? { x: settings.logo_x, y: settings.logo_y } : null
            );

            compositeLayers.push({
                input: finalLogoBuffer,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            });
        }

        // --- LAYER B: TEXT ---
        if (settings.text_content) {
            const scale = useMobile ? settings.mobile_scale : 1.0;
            const position = useMobile ? settings.mobile_position : settings.text_position;
            const opacity = settings.text_opacity;
            const scaledSize = Math.floor(settings.text_size * scale * resFactor);
            const scaledMargin = Math.floor(20 * resFactor);

            const textSVG = generateTextSVG(
                settings.text_content, settings.text_font, scaledSize,
                settings.text_color, settings.text_outline_color,
                settings.text_outline, resFactor, settings
            );

            let processedText = sharp(textSVG).png();
            if (opacity < 1.0) {
                processedText = processedText.composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true, blend: 'dest-in'
                }]);
            }

            const finalTextBuffer = await processedText.toBuffer();
            const finalTextMeta = await sharp(finalTextBuffer).metadata();

            const coords = getPositionCoordinates(
                position, metadata.width, metadata.height,
                finalTextMeta.width, finalTextMeta.height,
                scaledMargin,
                settings.use_custom_placement ? { x: settings.text_x, y: settings.text_y } : null
            );

            compositeLayers.push({
                input: finalTextBuffer,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            });
        }

        // 4. Final Single-Pass Execution
        // sharp pipeline with sequentialRead hint for memory efficiency
        const finalBuffer = await sharp(imageBuffer, { sequentialRead: true })
            .composite(compositeLayers)
            .jpeg({ quality: 90, progressive: true, mozjpeg: true })
            .toBuffer();

        return {
            buffer: finalBuffer,
            hash: imageHash,
            metadata: { width: metadata.width, height: metadata.height, format: metadata.format }
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

        // Download logo once for preview if needed
        let preloadedLogoBuffer = null;
        if (settings.logo_url) {
            preloadedLogoBuffer = await downloadImage(settings.logo_url);
        }

        // Apply watermark to resized image
        let processedBuffer = resizedBuffer;

        if (settings.logo_url) {
            processedBuffer = await applyLogoWatermark(processedBuffer, settings, metadata, preloadedLogoBuffer);
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
