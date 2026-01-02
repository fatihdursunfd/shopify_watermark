import express from 'express';
import { getSubscriptionDetails } from '../services/billing.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();

/**
 * GET /api/billing/info
 * Retrieves current subscription status and plan details.
 * Supports ?sync=1 to force a refresh from Shopify API.
 */
router.get('/info', asyncHandler(async (req, res) => {
    const { session } = res.locals.shopify;
    const forceSync = req.query.sync === '1';

    const data = await getSubscriptionDetails(session.shop, session.accessToken, forceSync);

    res.json({
        ...data,
        shop: session.shop
    });
}));

/**
 * POST /api/billing/subscribe
 * Initiates a new subscription charge.
 * Note: This endpoint is currently a placeholder for the Base App.
 */
router.post('/subscribe', asyncHandler(async (req, res) => {
    // Logic should be delegated to a service, e.g. billingService.createSubscription(...)
    res.status(501).json({ error: 'Not implemented in Base App' });
}));

export default router;
