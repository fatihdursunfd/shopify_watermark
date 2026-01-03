import express from 'express';
import { asyncHandler } from '../middleware/error.js';
import {
    getWatermarkSettings,
    upsertWatermarkSettings
} from '../db/repositories/watermarkSettingsRepository.js';
import {
    createWatermarkJob,
    getWatermarkJob,
    getWatermarkJobsByShop,
    updateJobStatus
} from '../db/repositories/watermarkJobsRepository.js';
import {
    getJobItems
} from '../db/repositories/watermarkJobItemsRepository.js';
import {
    getWatermarkRules,
    createWatermarkRule,
    updateWatermarkRule,
    deleteWatermarkRule,
    toggleRuleEnabled
} from '../db/repositories/watermarkRulesRepository.js';
import {
    getWatermarkAssets,
    deleteWatermarkAsset,
    createWatermarkAsset
} from '../db/repositories/watermarkAssetsRepository.js';
import {
    JOB_STATUS,
    JOB_TYPE,
    SCOPE_TYPE,
    MESSAGES
} from '../constants/watermark.js';
import { createPreview } from '../services/watermark/previewService.js';
import { addWatermarkJob, cancelJob, addRollbackJob } from '../services/watermarkQueue.js';
import { GET_COLLECTIONS, STAGED_UPLOADS_CREATE, FILE_CREATE } from '../graphql/watermark-queries.js';
import { shopify } from '../config/shopify-app.js';

const router = express.Router();

// ============================================================================
// SETTINGS ROUTES
// ============================================================================

/**
 * GET /api/watermark/settings
 * Get current watermark settings for the shop
 */
router.get('/settings', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;

    const settings = await getWatermarkSettings(session.shop);

    res.json({
        success: true,
        settings
    });
}));

/**
 * POST /api/watermark/settings
 * Update watermark settings for the shop
 */
router.post('/settings', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const settingsData = req.body;

    const settings = await upsertWatermarkSettings(session.shop, settingsData);

    res.json({
        success: true,
        message: MESSAGES.SETTINGS_SAVED,
        settings
    });
}));

// ============================================================================
// PREVIEW ROUTE
// ============================================================================

/**
 * POST /api/watermark/preview
 * Generate watermark preview
 * Body: { imageUrl, settings (optional) }
 */
router.post('/preview', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { imageUrl, settings } = req.body;

    if (!imageUrl) {
        return res.status(400).json({
            success: false,
            error: 'imageUrl is required'
        });
    }

    const preview = await createPreview(session.shop, imageUrl, settings);

    res.json(preview);
}));

// ============================================================================
// ASSETS ROUTES
// ============================================================================

/**
 * GET /api/watermark/assets
 * Get all watermark assets for the shop
 */
router.get('/assets', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;

    const assets = await getWatermarkAssets(session.shop);

    res.json({
        success: true,
        assets
    });
}));

/**
 * POST /api/watermark/assets/staged-url
 * Get staged upload URL for Shopify
 */
router.post('/assets/staged-url', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { filename, mimeType } = req.body;

    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(STAGED_UPLOADS_CREATE, {
        variables: {
            input: [{
                filename,
                mimeType,
                resource: 'IMAGE',
                httpMethod: 'POST'
            }]
        }
    });

    res.json({
        success: true,
        target: response.data.stagedUploadsCreate.stagedTargets[0]
    });
}));

/**
 * POST /api/watermark/assets/register
 * Register uploaded file in Shopify and save to DB
 */
router.post('/assets/register', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { resourceUrl, filename, mimeType, fileSize } = req.body;

    const client = new shopify.api.clients.Graphql({ session });

    // 1. Create file in Shopify
    const fileCreateRes = await client.request(FILE_CREATE, {
        variables: {
            files: [{
                originalSource: resourceUrl,
                contentType: 'IMAGE',
                alt: filename
            }]
        }
    });

    const userErrors = fileCreateRes.data.fileCreate.userErrors;
    if (userErrors?.length > 0) {
        throw new Error(`Shopify FileCreate Error: ${userErrors[0].message}`);
    }

    let fileData = fileCreateRes.data.fileCreate.files[0];
    const shopifyFileId = fileData.id;

    // Shopify files are processed asynchronously. If it's a MediaImage, 
    // the image.url might be null initially while Shopify processes it.
    let publicUrl = fileData.image?.url || fileData.url;

    // Retry polling for the URL if it's not immediately available
    if (!publicUrl) {
        console.log(`[Assets] URL not ready for ${shopifyFileId}, polling...`);
        for (let i = 0; i < 5; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
            const pollRes = await client.request(`
                query getFile($id: ID!) {
                    node(id: $id) {
                        ... on MediaImage {
                            image { url }
                        }
                        ... on GenericFile {
                            url
                        }
                    }
                }
            `, { variables: { id: shopifyFileId } });

            publicUrl = pollRes.data.node?.image?.url || pollRes.data.node?.url;
            if (publicUrl) break;
        }
    }

    if (!publicUrl) {
        throw new Error('Shopify confirmed file creation but public URL is still not available after polling.');
    }

    // 2. Save to our database
    const asset = await createWatermarkAsset(
        session.shop,
        filename,
        publicUrl,
        fileSize || 0,
        mimeType,
        shopifyFileId
    );

    res.json({
        success: true,
        asset
    });
}));

/**
 * DELETE /api/watermark/assets/:id
 * Delete a watermark asset
 */
router.delete('/assets/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const asset = await deleteWatermarkAsset(id);

    res.json({
        success: true,
        message: 'Asset deleted successfully',
        asset
    });
}));

/**
 * GET /api/shopify/collections
 * Get all collections from Shopify
 */
router.get('/shopify/collections', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;

    const client = new shopify.api.clients.Graphql({ session });

    const response = await client.request(GET_COLLECTIONS);

    const collections = response.data.collections.edges.map(edge => ({
        id: edge.node.id,
        title: edge.node.title,
        count: edge.node.productsCount.count
    }));

    res.json({
        success: true,
        collections
    });
}));

// ============================================================================
// JOBS ROUTES
// ============================================================================

/**
 * POST /api/watermark/jobs
 * Create a new watermark job
 * Body: { scopeType, scopeValue, totalProducts }
 */
router.post('/jobs', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { scopeType, scopeValue, totalProducts } = req.body;

    // Validate scope type
    if (!Object.values(SCOPE_TYPE).includes(scopeType)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid scope type'
        });
    }

    // Get current settings as snapshot
    const settings = await getWatermarkSettings(session.shop);

    // Validate settings
    if (!settings.logo_url && !settings.text_content) {
        return res.status(400).json({
            success: false,
            error: 'Please configure watermark settings (logo or text) before creating a job'
        });
    }

    // Create job
    const job = await createWatermarkJob(
        session.shop,
        JOB_TYPE.APPLY,
        scopeType,
        scopeValue,
        settings,
        totalProducts || 0
    );

    // 🚀 Queue job for processing
    await addWatermarkJob(job.id, session.shop, scopeType, scopeValue);

    res.json({
        success: true,
        message: MESSAGES.JOB_CREATED,
        job
    });
}));

/**
 * GET /api/watermark/jobs
 * Get all jobs for the shop (paginated)
 */
router.get('/jobs', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const jobs = await getWatermarkJobsByShop(session.shop, limit, offset);

    res.json({
        success: true,
        jobs,
        pagination: {
            limit,
            offset,
            hasMore: jobs.length === limit
        }
    });
}));

/**
 * GET /api/watermark/jobs/:id
 * Get job details by ID
 */
router.get('/jobs/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const job = await getWatermarkJob(id);

    if (!job) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }

    res.json({
        success: true,
        job
    });
}));

/**
 * GET /api/watermark/jobs/:id/items
 * Get job items (paginated)
 */
router.get('/jobs/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const items = await getJobItems(id, limit, offset);

    res.json({
        success: true,
        items,
        pagination: {
            limit,
            offset,
            hasMore: items.length === limit
        }
    });
}));

/**
 * POST /api/watermark/jobs/:id/cancel
 * Cancel a running job
 */
router.post('/jobs/:id/cancel', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const job = await getWatermarkJob(id);

    if (!job) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }

    if (job.status !== JOB_STATUS.PENDING && job.status !== JOB_STATUS.PROCESSING) {
        return res.status(400).json({
            success: false,
            error: 'Job cannot be cancelled (already completed or failed)'
        });
    }

    const updatedJob = await updateJobStatus(id, JOB_STATUS.CANCELLED);

    // 🛑 Signal worker to stop processing (remove from queue)
    await cancelJob(id);

    res.json({
        success: true,
        message: MESSAGES.JOB_CANCELLED,
        job: updatedJob
    });
}));

/**
 * POST /api/watermark/jobs/:id/rollback
 * Initiate rollback for a completed job
 */
router.post('/jobs/:id/rollback', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { id } = req.params;

    const job = await getWatermarkJob(id);

    if (!job) {
        return res.status(404).json({
            success: false,
            error: 'Job not found'
        });
    }

    if (job.status !== JOB_STATUS.COMPLETED) {
        return res.status(400).json({
            success: false,
            error: 'Only completed jobs can be rolled back'
        });
    }

    // 🚀 Create rollback job and queue
    await addRollbackJob(id, session.shop);

    res.json({
        success: true,
        message: MESSAGES.ROLLBACK_STARTED,
        jobId: id
    });
}));

// ============================================================================
// RULES ROUTES
// ============================================================================

/**
 * GET /api/watermark/rules
 * Get all automation rules for the shop
 */
router.get('/rules', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;

    const rules = await getWatermarkRules(session.shop);

    res.json({
        success: true,
        rules
    });
}));

/**
 * POST /api/watermark/rules
 * Create a new automation rule
 */
router.post('/rules', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const { ruleName, enabled, triggerType, collectionIds, tagFilters } = req.body;

    // Get current settings as snapshot
    const settings = await getWatermarkSettings(session.shop);

    const rule = await createWatermarkRule(
        session.shop,
        ruleName,
        enabled ?? true,
        triggerType,
        collectionIds,
        tagFilters,
        settings
    );

    res.json({
        success: true,
        message: MESSAGES.RULE_CREATED,
        rule
    });
}));

/**
 * PUT /api/watermark/rules/:id
 * Update an automation rule
 */
router.put('/rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { ruleName, enabled, triggerType, collectionIds, tagFilters, settingsSnapshot } = req.body;

    const rule = await updateWatermarkRule(
        id,
        ruleName,
        enabled,
        triggerType,
        collectionIds,
        tagFilters,
        settingsSnapshot
    );

    res.json({
        success: true,
        message: MESSAGES.RULE_UPDATED,
        rule
    });
}));

/**
 * DELETE /api/watermark/rules/:id
 * Delete an automation rule
 */
router.delete('/rules/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const rule = await deleteWatermarkRule(id);

    res.json({
        success: true,
        message: MESSAGES.RULE_DELETED,
        rule
    });
}));

/**
 * POST /api/watermark/rules/:id/toggle
 * Toggle rule enabled status
 */
router.post('/rules/:id/toggle', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { enabled } = req.body;

    const rule = await toggleRuleEnabled(id, enabled);

    res.json({
        success: true,
        message: enabled ? 'Rule enabled' : 'Rule disabled',
        rule
    });
}));

export default router;
