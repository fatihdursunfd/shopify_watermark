export const QUERIES = {
    SCHEMA: `
        CREATE TABLE IF NOT EXISTS shop_tokens (
            shop VARCHAR(255) PRIMARY KEY,
            access_token VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS shop_subscriptions (
            shop VARCHAR(255) PRIMARY KEY,
            plan_type VARCHAR(50) DEFAULT 'FREE',
            subscription_id VARCHAR(255),
            status VARCHAR(50) DEFAULT 'ACTIVE',
            current_period_end TIMESTAMP,
            app_installation_id VARCHAR(255), 
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS shopify_sessions (
            id VARCHAR(255) PRIMARY KEY,
            shop VARCHAR(255) NOT NULL,
            state VARCHAR(255) NOT NULL,
            is_online BOOLEAN NOT NULL,
            scope VARCHAR(255),
            expires TIMESTAMP,
            access_token VARCHAR(255),
            online_access_info TEXT,
            createdAt TIMESTAMP DEFAULT NOW(),
            updatedAt TIMESTAMP DEFAULT NOW()
        );
        
        -- Watermark Tables
        CREATE TABLE IF NOT EXISTS watermark_settings (
            id SERIAL PRIMARY KEY,
            shop VARCHAR(255) UNIQUE NOT NULL,
            logo_url TEXT,
            logo_position VARCHAR(50) DEFAULT 'bottom-right',
            logo_opacity DECIMAL(3,2) DEFAULT 0.8,
            logo_margin INTEGER DEFAULT 20,
            logo_scale DECIMAL(3,2) DEFAULT 0.2,
            logo_rotation INTEGER DEFAULT 0,
            logo_x INTEGER DEFAULT 0,
            logo_y INTEGER DEFAULT 0,
            text_content TEXT,
            text_font VARCHAR(100) DEFAULT 'Arial',
            text_size INTEGER DEFAULT 24,
            text_color VARCHAR(7) DEFAULT '#FFFFFF',
            text_position VARCHAR(50) DEFAULT 'bottom-right',
            text_opacity DECIMAL(3,2) DEFAULT 0.8,
            text_outline BOOLEAN DEFAULT true,
            text_outline_color VARCHAR(7) DEFAULT '#000000',
            text_rotation INTEGER DEFAULT 0,
            text_x INTEGER DEFAULT 0,
            text_y INTEGER DEFAULT 0,
            use_custom_placement BOOLEAN DEFAULT false,
            mobile_enabled BOOLEAN DEFAULT false,
            mobile_position VARCHAR(50),
            mobile_scale DECIMAL(3,2) DEFAULT 0.15,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Migrations for existing tables
        DO $$ 
        BEGIN 
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='logo_rotation') THEN
                ALTER TABLE watermark_settings ADD COLUMN logo_rotation INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='text_rotation') THEN
                ALTER TABLE watermark_settings ADD COLUMN text_rotation INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='logo_x') THEN
                ALTER TABLE watermark_settings ADD COLUMN logo_x INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='logo_y') THEN
                ALTER TABLE watermark_settings ADD COLUMN logo_y INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='text_x') THEN
                ALTER TABLE watermark_settings ADD COLUMN text_x INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='text_y') THEN
                ALTER TABLE watermark_settings ADD COLUMN text_y INTEGER DEFAULT 0;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_settings' AND column_name='use_custom_placement') THEN
                ALTER TABLE watermark_settings ADD COLUMN use_custom_placement BOOLEAN DEFAULT false;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='watermark_job_items' AND column_name='variant_ids') THEN
                ALTER TABLE watermark_job_items ADD COLUMN variant_ids JSONB;
            END IF;
        END $$;
        
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
        
        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_watermark_jobs_shop_status ON watermark_jobs(shop, status);
        CREATE INDEX IF NOT EXISTS idx_watermark_job_items_job_id ON watermark_job_items(job_id);
        CREATE INDEX IF NOT EXISTS idx_watermark_job_items_status ON watermark_job_items(status);
        CREATE INDEX IF NOT EXISTS idx_watermark_job_items_hash ON watermark_job_items(image_hash);
        CREATE INDEX IF NOT EXISTS idx_watermark_job_items_product ON watermark_job_items(product_id);
        CREATE INDEX IF NOT EXISTS idx_rollback_runs_job_id ON rollback_runs(job_id);
        CREATE INDEX IF NOT EXISTS idx_watermark_rules_shop_enabled ON watermark_rules(shop, enabled);
        CREATE INDEX IF NOT EXISTS idx_watermark_assets_shop ON watermark_assets(shop);
    `,

    SAVE_TOKEN: `
        INSERT INTO shop_tokens (shop, access_token, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (shop) DO UPDATE SET access_token = EXCLUDED.access_token, updated_at = NOW();
    `,

    GET_TOKEN: `
        SELECT access_token FROM shop_tokens WHERE shop = $1;
    `,

    GET_SUBSCRIPTION: `
        SELECT * FROM shop_subscriptions WHERE shop = $1;
    `,

    UPSERT_SUBSCRIPTION: `
        INSERT INTO shop_subscriptions (shop, plan_type, subscription_id, status, current_period_end, app_installation_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (shop) 
        DO UPDATE SET 
            plan_type = EXCLUDED.plan_type,
            subscription_id = EXCLUDED.subscription_id,
            status = EXCLUDED.status,
            current_period_end = EXCLUDED.current_period_end,
            app_installation_id = COALESCE(EXCLUDED.app_installation_id, shop_subscriptions.app_installation_id),
            updated_at = NOW();
    `,

    CLEANUP_SHOP: `
        DELETE FROM shop_tokens WHERE shop = $1;
        DELETE FROM shop_subscriptions WHERE shop = $1;
        DELETE FROM shopify_sessions WHERE shop = $1;
    `,

    // --- Session Queries ---
    STORE_SESSION: `
        INSERT INTO shopify_sessions
          (id, shop, state, is_online, scope, expires, access_token, online_access_info)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           shop = EXCLUDED.shop,
           state = EXCLUDED.state,
           is_online = EXCLUDED.is_online,
           scope = EXCLUDED.scope,
           expires = EXCLUDED.expires,
           access_token = EXCLUDED.access_token,
           online_access_info = EXCLUDED.online_access_info;
    `,

    LOAD_SESSION: `
        SELECT id, shop, state, is_online, scope, expires, access_token, online_access_info
        FROM shopify_sessions WHERE id=$1;
    `,

    DELETE_SESSION: `
        DELETE FROM shopify_sessions WHERE id=$1;
    `,

    DELETE_SESSIONS: `
        DELETE FROM shopify_sessions WHERE id = ANY($1::text[]);
    `,

    FIND_SESSIONS_BY_SHOP: `
        SELECT id, shop, state, is_online, scope, expires, access_token, online_access_info
        FROM shopify_sessions WHERE shop=$1;
    `
};