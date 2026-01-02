import { useMemo } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import { AuthStatus, AuthConfig, BillingInfo } from '../types/api';

export function useApi() {
    const app = useAppBridge();

    const api = useMemo(() => {

        async function jsonRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
            try {
                const res = await authenticatedFetch(app, url, options);

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw { status: res.status, message: text };
                }

                return await res.json().catch(() => ({}));
            } catch (error: any) {
                console.error(`[API] Error calling ${url}:`, error);
                throw error;
            }
        }

        return {
            /**
             * Check if the current session is authenticated and valid
             */
            checkAuth: () => jsonRequest<AuthStatus>('/api/auth/status'),

            /**
             * Verify the session token simply by pinging a test endpoint
             */
            verifyToken: async (): Promise<boolean> => {
                try {
                    await jsonRequest('/api/test-token');
                    return true;
                } catch {
                    return false;
                }
            },

            /**
             * Get public auth configuration
             */
            getAuthConfig: () => jsonRequest<AuthConfig>('/auth/config'),

            /**
             * Get watermark settings
             */
            getWatermarkSettings: () => jsonRequest<{ success: boolean; settings: any }>('/api/watermark/settings'),

            /**
             * Save watermark settings
             */
            saveWatermarkSettings: (settings: any) =>
                jsonRequest<{ success: boolean; settings: any }>('/api/watermark/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                }),

            /**
             * Generate watermark preview
             */
            generatePreview: (imageUrl: string, settings: any) =>
                jsonRequest<{ preview: string; width: number; height: number }>('/api/watermark/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageUrl, settings })
                }),

            /**
             * Create watermark job
             */
            createJob: (scopeType: string, scopeValue: any, totalProducts: number) =>
                jsonRequest<{ success: boolean; job: any }>('/api/watermark/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scopeType, scopeValue, totalProducts })
                }),

            /**
             * Get jobs list
             */
            getJobs: (limit = 50, offset = 0) =>
                jsonRequest<{ success: boolean; jobs: any[] }>(`/api/watermark/jobs?limit=${limit}&offset=${offset}`),

            /**
             * Rollback job
             */
            rollbackJob: (jobId: string) =>
                jsonRequest<{ success: boolean }>(`/api/watermark/jobs/${jobId}/rollback`, {
                    method: 'POST'
                }),

            /**
             * Get Shopify collections list
             */
            getCollections: () => jsonRequest<{ success: boolean; collections: any[] }>('/api/watermark/shopify/collections'),

            getStagedUploadUrl: (filename: string, mimeType: string) =>
                jsonRequest<{ success: boolean; target: any }>('/api/watermark/assets/staged-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, mimeType })
                }),

            registerAsset: (data: { resourceUrl: string, filename: string, mimeType: string, fileSize: number }) =>
                jsonRequest<{ success: boolean; asset: any }>('/api/watermark/assets/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                }),

            getBillingInfo: (sync = false) =>
                jsonRequest<BillingInfo>(`/api/billing/info${sync ? '?sync=1' : ''}`)
        };

    }, [app]);

    return api;
}
