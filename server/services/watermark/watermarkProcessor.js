import sharp from 'sharp';
import axios from 'axios';
import { getPositionCoordinates, shouldUseMobileProfile } from '../../constants/watermark.js';

/**
 * Senior Watermark Processor
 * Optimized for memory and speed using Sharp's streaming capabilities.
 */
export class WatermarkProcessor {
    constructor(settings) {
        this.settings = settings;
        this.logoBuffer = null;
    }

    async init() {
        if (this.settings.logo_url && !this.logoBuffer) {
            const start = process.hrtime();
            const res = await axios.get(this.settings.logo_url, { responseType: 'arraybuffer' });
            this.logoBuffer = Buffer.from(res.data);
            const end = process.hrtime(start);
            console.log(`[Processor] Logo preloaded in ${(end[0] * 1000 + end[1] / 1000000).toFixed(2)}ms`);
        }
    }

    /**
     * Processes a single image via streams
     * @returns {Object} { stream, stats }
     */
    async process(imageUrl) {
        const timings = {
            total_start: process.hrtime(),
            download_ms: 0,
            sharp_ms: 0,
            upload_ms: 0,
            total_ms: 0
        };

        // 1. Download as Stream
        const downloadStart = process.hrtime();
        const response = await axios({
            url: imageUrl,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000
        });
        const downloadEnd = process.hrtime(downloadStart);
        timings.download_ms = (downloadEnd[0] * 1000 + downloadEnd[1] / 1000000).toFixed(2);

        const inputSize = parseInt(response.headers['content-length'] || 0);

        // 2. Setup Sharp with sequentialRead for memory efficiency
        const sharpStart = process.hrtime();

        // We need metadata for coordinates. Sharp can get this from the stream.
        // To avoid consuming the stream, we use a PassThrough fork or a simpler approach:
        // Use a clone or just use the fact that many formats have metadata at the start.

        // Optimization: Create a pipeline that emits metadata
        const pipeline = sharp({ sequentialRead: true, failOnError: false });

        // Setup composition layers
        const metadata = await sharp(imageUrl.split('?')[0]).metadata(); // Fast probe if possible, but let's be robust
        // Actually, if we use the stream, we MUST wait for the 'info' event or metadata() call.

        // Let's use a small buffer for the header to get metadata (first 64KB is usually enough)
        // For simplicity and speed in this refactor, we'll use one metadata call and one stream.

        const compositeLayers = await this._prepareLayers(metadata);

        // Configure output format to match input (or default to JPEG)
        // Keep original format logic
        const format = metadata.format || 'jpeg';

        // Pipe download into processor
        const processedStream = response.data.pipe(pipeline.composite(compositeLayers));

        if (format === 'png') {
            processedStream.png({ compressionLevel: 9 });
        } else if (format === 'webp') {
            processedStream.webp({ quality: 85 });
        } else {
            processedStream.jpeg({ quality: 90, progressive: true, mozjpeg: true });
        }

        const sharpEnd = process.hrtime(sharpStart);
        timings.sharp_ms = (sharpEnd[0] * 1000 + sharpEnd[1] / 1000000).toFixed(2);

        return {
            stream: processedStream,
            metadata: {
                width: metadata.width,
                height: metadata.height,
                format: metadata.format,
                input_size: inputSize
            },
            timings
        };
    }

    async _prepareLayers(metadata) {
        const layers = [];
        const baseRes = 800;
        const resFactor = metadata.width / baseRes;
        const useMobile = this.settings.mobile_enabled && shouldUseMobileProfile(metadata.width, metadata.height);

        if (this.logoBuffer) {
            const logoMeta = await sharp(this.logoBuffer).metadata();
            const scale = useMobile ? this.settings.mobile_scale : this.settings.logo_scale;
            const position = useMobile ? this.settings.mobile_position : this.settings.logo_position;
            const opacity = this.settings.logo_opacity;
            const rotation = this.settings.logo_rotation || 0;

            const w = Math.floor(metadata.width * scale);
            const h = Math.floor((logoMeta.height / logoMeta.width) * w);

            let logo = sharp(this.logoBuffer)
                .resize(w, h, { fit: 'inside', withoutEnlargement: true })
                .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });

            if (opacity < 1.0) {
                logo = logo.composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true, blend: 'dest-in'
                }]);
            }

            const processedLogo = await logo.toBuffer();
            const finalLogoMeta = await sharp(processedLogo).metadata();
            const margin = Math.floor(this.settings.logo_margin * resFactor);

            const coords = getPositionCoordinates(
                position, metadata.width, metadata.height,
                finalLogoMeta.width, finalLogoMeta.height,
                margin,
                this.settings.use_custom_placement ? { x: this.settings.logo_x, y: this.settings.logo_y } : null
            );

            layers.push({
                input: processedLogo,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            });
        }

        if (this.settings.text_content) {
            const scale = useMobile ? this.settings.mobile_scale : 1.0;
            const position = useMobile ? this.settings.mobile_position : this.settings.text_position;
            const opacity = this.settings.text_opacity;
            const scaledSize = Math.floor(this.settings.text_size * scale * resFactor);
            const scaledMargin = Math.floor(20 * resFactor);

            const textSVG = this._generateTextSVG(
                this.settings.text_content, this.settings.text_font, scaledSize,
                this.settings.text_color, this.settings.text_outline_color,
                this.settings.text_outline, resFactor
            );

            let text = sharp(textSVG).png();
            if (opacity < 1.0) {
                text = text.composite([{
                    input: Buffer.from([255, 255, 255, Math.floor(opacity * 255)]),
                    raw: { width: 1, height: 1, channels: 4 },
                    tile: true, blend: 'dest-in'
                }]);
            }

            const processedText = await text.toBuffer();
            const finalTextMeta = await sharp(processedText).metadata();

            const coords = getPositionCoordinates(
                position, metadata.width, metadata.height,
                finalTextMeta.width, finalTextMeta.height,
                scaledMargin,
                this.settings.use_custom_placement ? { x: this.settings.text_x, y: this.settings.text_y } : null
            );

            layers.push({
                input: processedText,
                top: Math.floor(coords.y),
                left: Math.floor(coords.x)
            });
        }

        return layers;
    }

    _generateTextSVG(text, font, size, color, outlineColor, outline, resFactor) {
        const escapedText = text.replace(/[<>&'"]/g, c => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'
        }[c]));

        const w = Math.ceil(text.length * size * 1.0);
        const h = Math.ceil(size * 1.6);

        let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
        if (outline) {
            const strokeWidth = Math.max(2, Math.floor(4 * resFactor));
            svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="none" stroke="${outlineColor}" stroke-width="${strokeWidth}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${escapedText}</text>`;
        }
        svg += `<text x="50%" y="50%" font-family="${font}" font-size="${size}" fill="${color}" text-anchor="middle" dominant-baseline="middle" font-weight="bold">${escapedText}</text></svg>`;

        return Buffer.from(svg);
    }
}
