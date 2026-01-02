export interface AuthStatus {
    ok: boolean;
    authenticated: boolean;
    shop?: string;
    hasAccessToken?: boolean;
}

export interface BillingInfo {
    currentPlan: string;
    status: string;
    shop?: string;
    installationId?: string;
    plans?: Record<string, any>;
    usage?: any;
}

export interface AuthConfig {
    shop: string | null;
    hasShopConfigured: boolean;
    apiKey: string;
}

export interface WatermarkSettings {
    logo_url: string | null;
    logo_position: string;
    logo_opacity: number;
    logo_margin: number;
    logo_scale: number;
    text_content: string | null;
    text_font: string;
    text_size: number;
    text_color: string;
    text_position: string;
    text_opacity: number;
    text_outline: boolean;
    text_outline_color: string;
    mobile_enabled: boolean;
    mobile_position: string;
    mobile_scale: number;
}

export interface WatermarkJob {
    id: string;
    shop: string;
    job_type: 'apply' | 'rollback';
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'rolled_back';
    scope_type: 'all' | 'collection' | 'manual';
    scope_value: any;
    total_products: number;
    processed_products: number;
    failed_products: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
}

export interface WatermarkRule {
    id: number;
    rule_name: string;
    enabled: boolean;
    trigger_type: string;
    collection_ids: string[];
    tag_filters: string[];
    settings_snapshot: WatermarkSettings;
}

export interface ApiError {
    status: number;
    message: string;
    code?: string;
}