/**
 * Constants for Watermark feature
 * Positions, limits, defaults, and enums
 */

// ============================================================================
// WATERMARK POSITIONS
// ============================================================================

export const WATERMARK_POSITIONS = {
    TOP_LEFT: 'top-left',
    TOP_CENTER: 'top-center',
    TOP_RIGHT: 'top-right',
    MIDDLE_LEFT: 'middle-left',
    CENTER: 'center',
    MIDDLE_RIGHT: 'middle-right',
    BOTTOM_LEFT: 'bottom-left',
    BOTTOM_CENTER: 'bottom-center',
    BOTTOM_RIGHT: 'bottom-right'
};

export const POSITION_PRESETS = [
    { value: WATERMARK_POSITIONS.TOP_LEFT, label: 'Top Left' },
    { value: WATERMARK_POSITIONS.TOP_CENTER, label: 'Top Center' },
    { value: WATERMARK_POSITIONS.TOP_RIGHT, label: 'Top Right' },
    { value: WATERMARK_POSITIONS.MIDDLE_LEFT, label: 'Middle Left' },
    { value: WATERMARK_POSITIONS.CENTER, label: 'Center' },
    { value: WATERMARK_POSITIONS.MIDDLE_RIGHT, label: 'Middle Right' },
    { value: WATERMARK_POSITIONS.BOTTOM_LEFT, label: 'Bottom Left' },
    { value: WATERMARK_POSITIONS.BOTTOM_CENTER, label: 'Bottom Center' },
    { value: WATERMARK_POSITIONS.BOTTOM_RIGHT, label: 'Bottom Right' }
];

// ============================================================================
// JOB STATUSES
// ============================================================================

export const JOB_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    ROLLED_BACK: 'rolled_back'
};

export const JOB_ITEM_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ROLLED_BACK: 'rolled_back',
    SKIPPED: 'skipped'
};

export const ROLLBACK_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// ============================================================================
// JOB TYPES
// ============================================================================

export const JOB_TYPE = {
    APPLY: 'apply',
    ROLLBACK: 'rollback'
};

export const SCOPE_TYPE = {
    ALL: 'all',
    COLLECTION: 'collection',
    MANUAL: 'manual'
};

// ============================================================================
// RULE TRIGGERS
// ============================================================================

export const RULE_TRIGGER = {
    PRODUCT_CREATE: 'product_create',
    PRODUCT_UPDATE: 'product_update'
};

// ============================================================================
// IMAGE LIMITS & DEFAULTS
// ============================================================================

export const IMAGE_LIMITS = {
    MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
    MAX_DIMENSION: 10000, // 10000px
    MIN_DIMENSION: 100, // 100px
    SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
    SUPPORTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp']
};

export const WATERMARK_DEFAULTS = {
    // Logo defaults
    LOGO_POSITION: WATERMARK_POSITIONS.BOTTOM_RIGHT,
    LOGO_OPACITY: 0.8,
    LOGO_MARGIN: 20,
    LOGO_SCALE: 0.2,

    // Text defaults
    TEXT_FONT: 'Arial',
    TEXT_SIZE: 24,
    TEXT_COLOR: '#FFFFFF',
    TEXT_POSITION: WATERMARK_POSITIONS.BOTTOM_RIGHT,
    TEXT_OPACITY: 0.8,
    TEXT_OUTLINE: true,
    TEXT_OUTLINE_COLOR: '#000000',

    // Mobile defaults
    MOBILE_ENABLED: false,
    MOBILE_SCALE: 0.15,
    MOBILE_POSITION: WATERMARK_POSITIONS.BOTTOM_RIGHT
};

// ============================================================================
// FONTS
// ============================================================================

export const AVAILABLE_FONTS = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Georgia',
    'Palatino',
    'Garamond',
    'Comic Sans MS',
    'Trebuchet MS',
    'Impact'
];

// ============================================================================
// PROCESSING LIMITS
// ============================================================================

export const PROCESSING_LIMITS = {
    MAX_CONCURRENT_JOBS: 3, // Per shop
    MAX_PRODUCTS_PER_JOB: 1000,
    WORKER_CONCURRENCY: 5,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    BACKOFF_MULTIPLIER: 2
};

// ============================================================================
// QUEUE NAMES
// ============================================================================

export const QUEUE_NAMES = {
    WATERMARK_APPLY: 'watermark:apply',
    WATERMARK_ROLLBACK: 'watermark:rollback',
    WATERMARK_WEBHOOK: 'watermark:webhook'
};

// ============================================================================
// ERROR CODES
// ============================================================================

export const ERROR_CODES = {
    INVALID_IMAGE: 'INVALID_IMAGE',
    DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
    UPLOAD_FAILED: 'UPLOAD_FAILED',
    PROCESSING_FAILED: 'PROCESSING_FAILED',
    SHOPIFY_API_ERROR: 'SHOPIFY_API_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    DUPLICATE_HASH: 'DUPLICATE_HASH',
    NO_MEDIA_FOUND: 'NO_MEDIA_FOUND',
    SETTINGS_NOT_FOUND: 'SETTINGS_NOT_FOUND'
};

// ============================================================================
// MESSAGES
// ============================================================================

export const MESSAGES = {
    JOB_CREATED: 'Watermark job created successfully',
    JOB_STARTED: 'Watermark job started',
    JOB_COMPLETED: 'Watermark job completed',
    JOB_FAILED: 'Watermark job failed',
    JOB_CANCELLED: 'Watermark job cancelled',
    ROLLBACK_STARTED: 'Rollback started',
    ROLLBACK_COMPLETED: 'Rollback completed successfully',
    ROLLBACK_FAILED: 'Rollback failed',
    SETTINGS_SAVED: 'Watermark settings saved',
    ASSET_UPLOADED: 'Watermark asset uploaded',
    RULE_CREATED: 'Automation rule created',
    RULE_UPDATED: 'Automation rule updated',
    RULE_DELETED: 'Automation rule deleted'
};

// ============================================================================
// ASPECT RATIO DETECTION
// ============================================================================

export const ASPECT_RATIO = {
    PORTRAIT_THRESHOLD: 1.2, // height/width > 1.2 = portrait
    LANDSCAPE_THRESHOLD: 0.8, // height/width < 0.8 = landscape
    SQUARE_MIN: 0.8,
    SQUARE_MAX: 1.2
};

/**
 * Determine if image should use mobile profile
 */
export function shouldUseMobileProfile(width, height) {
    const ratio = height / width;
    return ratio > ASPECT_RATIO.PORTRAIT_THRESHOLD;
}

/**
 * Get position coordinates based on preset
 */
export function getPositionCoordinates(position, imageWidth, imageHeight, watermarkWidth, watermarkHeight, margin) {
    const coords = { x: 0, y: 0 };

    switch (position) {
        case WATERMARK_POSITIONS.TOP_LEFT:
            coords.x = margin;
            coords.y = margin;
            break;
        case WATERMARK_POSITIONS.TOP_CENTER:
            coords.x = (imageWidth - watermarkWidth) / 2;
            coords.y = margin;
            break;
        case WATERMARK_POSITIONS.TOP_RIGHT:
            coords.x = imageWidth - watermarkWidth - margin;
            coords.y = margin;
            break;
        case WATERMARK_POSITIONS.MIDDLE_LEFT:
            coords.x = margin;
            coords.y = (imageHeight - watermarkHeight) / 2;
            break;
        case WATERMARK_POSITIONS.CENTER:
            coords.x = (imageWidth - watermarkWidth) / 2;
            coords.y = (imageHeight - watermarkHeight) / 2;
            break;
        case WATERMARK_POSITIONS.MIDDLE_RIGHT:
            coords.x = imageWidth - watermarkWidth - margin;
            coords.y = (imageHeight - watermarkHeight) / 2;
            break;
        case WATERMARK_POSITIONS.BOTTOM_LEFT:
            coords.x = margin;
            coords.y = imageHeight - watermarkHeight - margin;
            break;
        case WATERMARK_POSITIONS.BOTTOM_CENTER:
            coords.x = (imageWidth - watermarkWidth) / 2;
            coords.y = imageHeight - watermarkHeight - margin;
            break;
        case WATERMARK_POSITIONS.BOTTOM_RIGHT:
        default:
            coords.x = imageWidth - watermarkWidth - margin;
            coords.y = imageHeight - watermarkHeight - margin;
            break;
    }

    return coords;
}
