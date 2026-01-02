import { shopifyApp } from "@shopify/shopify-app-express";
import { ApiVersion } from "@shopify/shopify-api";
import { PostgresSessionStorage } from "../db/session-storage.js";
import { upsertShopSubscription, getShopSubscription } from "../db/repositories/subscriptionRepository.js";
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_STATUS } from "../constants/index.js";

const sessionStorage = new PostgresSessionStorage();

// TODO: Define your app's required scopes here (e.g., 'read_products,write_orders')
const DEFAULT_SCOPES = "";

export const shopify = shopifyApp({
    api: {
        apiKey: process.env.SHOPIFY_API_KEY,
        apiSecretKey: process.env.SHOPIFY_API_SECRET,
        scopes: (process.env.SCOPES || DEFAULT_SCOPES).split(",").map(s => s.trim()).filter(Boolean),
        hostName: (process.env.HOST || "localhost").replace(/^https?:\/\//, ""),
        isEmbeddedApp: true,
        apiVersion: ApiVersion.October24, // Use latest stable
        future: {
            unstable_newEmbeddedAuthStrategy: true,
        },
    },
    auth: {
        path: "/auth",
        callbackPath: "/auth/callback",
    },
    webhooks: {
        path: "/webhooks",
    },
    sessionStorage,
    hooks: {
        afterAuth: async ({ session }) => {
            try {
                console.log(`[Auth] 🟢 Initializing/Updating session for ${session.shop}`);

                const existing = await getShopSubscription(session.shop);
                if (!existing || existing.plan_type === SUBSCRIPTION_PLANS.FREE) {
                    await upsertShopSubscription(
                        session.shop,
                        SUBSCRIPTION_PLANS.FREE,
                        null,
                        SUBSCRIPTION_STATUS.PENDING,
                        null
                    );
                }
                const webhookResponses = await shopify.api.webhooks.register({ session });
                console.log(`[Auth] Webhook registration for ${session.shop}:`, JSON.stringify(webhookResponses));
            } catch (e) {
                console.error(`[Auth] 🔴 Failed to init/register: ${e.message}`);
            }
        },
    },
});