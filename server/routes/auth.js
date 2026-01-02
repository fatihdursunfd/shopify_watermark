import express from 'express';
import { checkAuthStatus } from '../services/auth.js';
import { asyncHandler } from '../middleware/error.js';

const router = express.Router();

/**
 * GET /api/auth/status
 * Check authenticated session status using Shopify SDK session.
 * Delegates logic to authService.
 */
router.get('/status', asyncHandler(async (req, res) => {
    const session = res.locals?.shopify?.session;
    const result = await checkAuthStatus(session);

    if (!result.authenticated) {
        return res.status(401).json(result);
    }

    return res.json(result);
}));

export default router;