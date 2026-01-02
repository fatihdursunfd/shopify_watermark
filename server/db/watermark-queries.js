/**
 * SQL queries for Watermark feature
 * Centralized query definitions following the repository pattern
 */

// ============================================================================
// TABLE CREATION QUERIES
// ============================================================================

export const CREATE_WATERMARK_SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS watermark_settings (
    id SERIAL PRIMARY KEY,
    shop VARCHAR(255) UNIQUE NOT NULL,
    
    -- Logo settings
    logo_url TEXT,
    logo_position VARCHAR(50) DEFAULT 'bottom-right',
    logo_opacity DECIMAL(3,2) DEFAULT 0.8,
    logo_margin INTEGER DEFAULT 20,
    logo_scale DECIMAL(3,2) DEFAULT 0.2,
    logo_rotation INTEGER DEFAULT 0,
    
    -- Text settings
    text_content TEXT,
    text_font VARCHAR(100) DEFAULT 'Arial',
    text_size INTEGER DEFAULT 24,
    text_color VARCHAR(7) DEFAULT '#FFFFFF',
    text_position VARCHAR(50) DEFAULT 'bottom-right',
    text_opacity DECIMAL(3,2) DEFAULT 0.8,
    text_outline BOOLEAN DEFAULT true,
    text_outline_color VARCHAR(7) DEFAULT '#000000',
    text_rotation INTEGER DEFAULT 0,
    
    -- Mobile profile
    mobile_enabled BOOLEAN DEFAULT false,
    mobile_position VARCHAR(50),
    mobile_scale DECIMAL(3,2) DEFAULT 0.15,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_WATERMARK_ASSETS_TABLE = `
CREATE TABLE IF NOT EXISTS watermark_assets (
    id SERIAL PRIMARY KEY,
    shop VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    shopify_file_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);
`;

export const CREATE_WATERMARK_JOBS_TABLE = `
CREATE TABLE IF NOT EXISTS watermark_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop VARCHAR(255) NOT NULL,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    scope_type VARCHAR(50) NOT NULL,
    scope_value TEXT,
    settings_snapshot JSONB,
    total_products INTEGER DEFAULT 0,
    processed_products INTEGER DEFAULT 0,
    failed_products INTEGER DEFAULT 0,
    error_log TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_WATERMARK_JOB_ITEMS_TABLE = `
CREATE TABLE IF NOT EXISTS watermark_job_items (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES watermark_jobs(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_title TEXT,
    original_media_id TEXT,
    original_media_url TEXT,
    original_position INTEGER,
    original_is_featured BOOLEAN DEFAULT false,
    new_media_id TEXT,
    new_media_url TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    image_hash VARCHAR(64),
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_WATERMARK_RULES_TABLE = `
CREATE TABLE IF NOT EXISTS watermark_rules (
    id SERIAL PRIMARY KEY,
    shop VARCHAR(255) NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    trigger_type VARCHAR(50) NOT NULL,
    collection_ids TEXT[],
    tag_filters TEXT[],
    settings_snapshot JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_ROLLBACK_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS rollback_runs (
    id SERIAL PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES watermark_jobs(id) ON DELETE CASCADE,
    shop VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    items_to_rollback INTEGER DEFAULT 0,
    items_rolled_back INTEGER DEFAULT 0,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

// ============================================================================
// INDEX CREATION QUERIES
// ============================================================================

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_watermark_jobs_shop_status ON watermark_jobs(shop, status);
CREATE INDEX IF NOT EXISTS idx_watermark_job_items_job_id ON watermark_job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_watermark_job_items_status ON watermark_job_items(status);
CREATE INDEX IF NOT EXISTS idx_watermark_job_items_hash ON watermark_job_items(image_hash);
CREATE INDEX IF NOT EXISTS idx_watermark_job_items_product ON watermark_job_items(product_id);
CREATE INDEX IF NOT EXISTS idx_rollback_runs_job_id ON rollback_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_watermark_rules_shop_enabled ON watermark_rules(shop, enabled);
CREATE INDEX IF NOT EXISTS idx_watermark_assets_shop ON watermark_assets(shop);
`;

// ============================================================================
// WATERMARK SETTINGS QUERIES
// ============================================================================

export const GET_SETTINGS_BY_SHOP = `
SELECT * FROM watermark_settings WHERE shop = $1;
`;

export const UPSERT_SETTINGS = `
INSERT INTO watermark_settings(
    shop, logo_url, logo_position, logo_opacity, logo_margin, logo_scale, logo_rotation,
    text_content, text_font, text_size, text_color, text_position,
    text_opacity, text_outline, text_outline_color, text_rotation,
    mobile_enabled, mobile_position, mobile_scale, updated_at
) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
ON CONFLICT(shop) DO UPDATE SET
logo_url = EXCLUDED.logo_url,
    logo_position = EXCLUDED.logo_position,
    logo_opacity = EXCLUDED.logo_opacity,
    logo_margin = EXCLUDED.logo_margin,
    logo_scale = EXCLUDED.logo_scale,
    logo_rotation = EXCLUDED.logo_rotation,
    text_content = EXCLUDED.text_content,
    text_font = EXCLUDED.text_font,
    text_size = EXCLUDED.text_size,
    text_color = EXCLUDED.text_color,
    text_position = EXCLUDED.text_position,
    text_opacity = EXCLUDED.text_opacity,
    text_outline = EXCLUDED.text_outline,
    text_outline_color = EXCLUDED.text_outline_color,
    text_rotation = EXCLUDED.text_rotation,
    mobile_enabled = EXCLUDED.mobile_enabled,
    mobile_position = EXCLUDED.mobile_position,
    mobile_scale = EXCLUDED.mobile_scale,
    updated_at = CURRENT_TIMESTAMP
RETURNING *;
`;

// ============================================================================
// WATERMARK JOBS QUERIES
// ============================================================================

export const CREATE_JOB = `
INSERT INTO watermark_jobs (
    shop, job_type, status, scope_type, scope_value, settings_snapshot, total_products
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;
`;

export const GET_JOB_BY_ID = `
SELECT * FROM watermark_jobs WHERE id = $1;
`;

export const GET_JOBS_BY_SHOP = `
SELECT * FROM watermark_jobs 
WHERE shop = $1 
ORDER BY created_at DESC 
LIMIT $2 OFFSET $3;
`;

export const UPDATE_JOB_STATUS = `
UPDATE watermark_jobs 
SET status = $2, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const UPDATE_JOB_PROGRESS = `
UPDATE watermark_jobs 
SET processed_products = $2, failed_products = $3, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const START_JOB = `
UPDATE watermark_jobs 
SET status = 'processing', started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const COMPLETE_JOB = `
UPDATE watermark_jobs 
SET status = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

// ============================================================================
// WATERMARK JOB ITEMS QUERIES
// ============================================================================

export const CREATE_JOB_ITEM = `
INSERT INTO watermark_job_items (
    job_id, product_id, product_title, original_media_id, original_media_url,
    original_position, original_is_featured, image_hash
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;
`;

export const UPDATE_JOB_ITEM_COMPLETED = `
UPDATE watermark_job_items 
SET status = 'completed', 
    new_media_id = $2, 
    new_media_url = $3,
    processed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const UPDATE_JOB_ITEM_FAILED = `
UPDATE watermark_job_items 
SET status = 'failed', 
    error_message = $2,
    processed_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const UPDATE_JOB_ITEM_ROLLED_BACK = `
UPDATE watermark_job_items 
SET status = 'rolled_back', updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const GET_JOB_ITEMS_BY_JOB = `
SELECT * FROM watermark_job_items 
WHERE job_id = $1 
ORDER BY created_at ASC
LIMIT $2 OFFSET $3;
`;

export const GET_JOB_ITEMS_FOR_ROLLBACK = `
SELECT * FROM watermark_job_items 
WHERE job_id = $1 AND status = 'completed'
ORDER BY created_at ASC;
`;

export const CHECK_DUPLICATE_HASH = `
SELECT * FROM watermark_job_items 
WHERE job_id = $1 AND image_hash = $2
LIMIT 1;
`;

// ============================================================================
// ROLLBACK RUNS QUERIES
// ============================================================================

export const CREATE_ROLLBACK_RUN = `
INSERT INTO rollback_runs (
    job_id, shop, items_to_rollback
) VALUES ($1, $2, $3)
RETURNING *;
`;

export const UPDATE_ROLLBACK_PROGRESS = `
UPDATE rollback_runs 
SET items_rolled_back = $2, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const COMPLETE_ROLLBACK_RUN = `
UPDATE rollback_runs 
SET status = $2, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const GET_ROLLBACK_RUN_BY_JOB = `
SELECT * FROM rollback_runs 
WHERE job_id = $1 
ORDER BY created_at DESC 
LIMIT 1;
`;

// ============================================================================
// WATERMARK RULES QUERIES
// ============================================================================

export const CREATE_RULE = `
INSERT INTO watermark_rules (
    shop, rule_name, enabled, trigger_type, collection_ids, tag_filters, settings_snapshot
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;
`;

export const GET_RULES_BY_SHOP = `
SELECT * FROM watermark_rules 
WHERE shop = $1 
ORDER BY created_at DESC;
`;

export const GET_ENABLED_RULES_BY_SHOP = `
SELECT * FROM watermark_rules 
WHERE shop = $1 AND enabled = true
ORDER BY created_at DESC;
`;

export const UPDATE_RULE = `
UPDATE watermark_rules 
SET rule_name = $2, enabled = $3, trigger_type = $4, 
    collection_ids = $5, tag_filters = $6, settings_snapshot = $7,
    updated_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;

export const DELETE_RULE = `
DELETE FROM watermark_rules WHERE id = $1 RETURNING *;
`;

// ============================================================================
// WATERMARK ASSETS QUERIES
// ============================================================================

export const CREATE_ASSET = `
INSERT INTO watermark_assets (
    shop, file_name, file_url, file_size, mime_type, shopify_file_id
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;
`;

export const GET_ASSETS_BY_SHOP = `
SELECT * FROM watermark_assets 
WHERE shop = $1 AND deleted_at IS NULL
ORDER BY created_at DESC;
`;

export const SOFT_DELETE_ASSET = `
UPDATE watermark_assets 
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = $1
RETURNING *;
`;
