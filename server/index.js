import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { shopify } from './config/shopify-app.js';
import { handlers as webhookHandlers } from './webhooks/index.js';
import authRoutes from './routes/auth.js';
import billingRoutes from './routes/billing.js';
import watermarkRoutes from './routes/watermark.js';
import { requestLogger, logSessionCheck } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/error.js';
import './services/watermarkWorker.js';
import './services/rollbackWorker.js'; // Start the rollback worker



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const isProd = process.env.NODE_ENV === 'production';
const DIST_DIR = path.join(__dirname, '../ui/dist');

// --- Webhooks (must be before express.json / auth middleware) ---
app.post(
    '/webhooks',
    (req, res, next) => {
        const start = Date.now();
        console.log('✅ HIT /webhooks', {
            topic: req.get('X-Shopify-Topic'),
            shop: req.get('X-Shopify-Shop-Domain'),
        });
        next();
    },
    // Shopify library handles verification and execution of handlers
    shopify.processWebhooks({ webhookHandlers })
);

// Safe GET for diagnostics
app.get('/webhooks', (_req, res) => res.status(200).send('OK'));

// JSON parser for rest of app
app.use(express.json());

// Global Middleware
app.use(requestLogger());
app.use(shopify.cspHeaders());

// --- Authentication ---
const protect = shopify.validateAuthenticatedSession();

app.get(shopify.config.auth.path, (req, res, next) => {
    const shop = req.query.shop;
    if (!shop) return res.status(400).send('No shop provided');
    return shopify.auth.begin()(req, res, next);
});

app.get('/auth/install', shopify.auth.begin());

app.get(
    shopify.config.auth.callbackPath,
    shopify.auth.callback(),
    shopify.redirectToShopifyOrAppRoot()
);

app.use('/api', protect, authRoutes);

// --- Base Routes ---

// Billing Routes
app.use('/api/billing', protect, billingRoutes);

// Watermark Routes
app.use('/api/watermark', protect, watermarkRoutes);

// Health / Session Check (Removed sessionMiniCheck)
app.get('/api/health', protect, (req, res) => {
    res.json({ status: 'ok', shop: res.locals.shopify.session.shop });
});

app.get('/api/test-token', (req, res) => {
    const session = res.locals?.shopify?.session || null;
    return res.json({
        ok: true,
        shop: session?.shop || null,
        hasAccessToken: Boolean(session?.accessToken),
    });
});


// Add your API routes here...
// app.use('/api/foo', protect, fooRoutes);


// --- Static Assets (Frontend) ---
if (isProd) {
    app.use('/assets', express.static(path.join(DIST_DIR, 'assets')));
}
app.use(express.static(DIST_DIR));

// SPA Fallback
const ensureInstalled = shopify.ensureInstalledOnShop
    ? shopify.ensureInstalledOnShop()
    : shopify.ensureInstalled();

// Root route - simple health check
app.get('/', (req, res, next) => {
    if (!req.query.shop) return res.status(200).send('OK');
    return next();
});

// SPA Fallback - only for non-static routes
app.get(/.*/, (req, res, next) => {
    // Skip middleware for static assets
    const isStaticAsset = req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/);
    if (isStaticAsset) {
        return res.status(404).send('Not Found');
    }

    // Apply ensureInstalled only for HTML requests
    return ensureInstalled(req, res, () => {
        try { logSessionCheck('spa_gate', req); } catch { }
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));