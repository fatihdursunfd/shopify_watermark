# Shopify Base App (Server)

A robust, modular, and production-ready Node.js backend for Shopify Apps. Built with Express and the official `@shopify/shopify-api` library.

## 🚀 Key Features

*   **Modular Architecture**: Separation of concerns using Repository and Service patterns.
*   **Authentication**: Complete OAuth flow (Online/Offline sessions) with auto-renewal.
*   **Database Agnostic Design**: Repository pattern makes it easy to switch DBs (PostgreSQL implemented by default).
*   **Resilient GraphQL**: "Ultimate Safe" GraphQL wrapper that handles rate limits, throttling, and transient errors automatically.
*   **Billing System**: Built-in subscription management with easy configuration.
*   **Webhooks**: Automatic registration and clean handler structure.
*   **Error Handling**: Centralized async error handling and request logging.
*   **Constants**: Centralized management for Plans, SQL Queries, and GraphQL Queries.

## 📂 Project Structure

```text
server/
├── config/              # App Configuration
│   └── shopify-app.js   # Shopify API & Auth Config
├── constants/           # Centralized Constants
│   ├── index.js         # General constants (Status, Logs)
│   └── plans.js         # Subscription Plans Config
├── db/                  # Database Layer
│   ├── index.js         # Connection Pool & Schema Init
│   ├── queries.js       # Raw SQL Queries defined here
│   └── repositories/    # Data Access Layer (DAL)
│       ├── shopRepository.js
│       ├── sessionRepository.js
│       ├── subscriptionRepository.js
│       └── cleanupRepository.js
├── graphql/             # GraphQL Layer
│   └── queries.js       # GraphQL Queries defined here
├── middleware/          # Express Middleware
│   ├── error.js         # Centralized Error Handler
│   └── requestLogger.js # Request/Response Logging
├── routes/              # API Routes (Controllers)
│   ├── auth.js          # Auth & Status Endpoints
│   └── billing.js       # Billing Endpoints
├── services/            # Business Logic Layer
│   ├── auth.js          # Auth Logic
│   └── billing.js       # Billing & Sync Logic
├── utils/               # Helpers
│   ├── logger.js        # Console Wrapper
│   ├── session.js       # Session/Token Helpers
│   └── shopify-client.js # Resilient GraphQL Client
├── webhooks/            # Webhook Handlers
│   └── index.js         # App Uninstalled, Updates, etc.
└── index.js             # Entry Point
```

## 🛠️ Customization Guide

### 1. Modifying Subscription Plans
Go to `server/constants/plans.js`.
Add or modify plan keys, names, and prices. The `billing.js` service will automatically use these config values.

```javascript
export const PLAN_CONFIG = {
    FREE: { ... },
    PRO: { ... },
    // Add ENTERPRISE: { ... }
};
```

### 2. Adding New Database Tables
1.  Add the `CREATE TABLE` SQL in `server/db/queries.js`.
2.  Update `server/db/index.js` to run the migration if needed (or use an external migration tool).
3.  Create a new repository in `server/db/repositories/`.

### 3. Adding New Webhooks
1.  Define the handler in `server/webhooks/index.js`.
2.  Ensure the topic is registered in `server/config/shopify-app.js` (or in your `shopify.app.toml`).

### 4. Fetching Data from Shopify
Use the resilient client wrapper in your services:

```javascript
import { graphqlRequest } from '../utils/shopify-client.js';
import { GRAPHQL_QUERIES } from '../graphql/queries.js';

const data = await graphqlRequest(shop, token, GRAPHQL_QUERIES.MY_QUERY);
```

## 🔐 Environment Variables

Ensure your `.env` file includes:

```env
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SCOPES=...
HOST=...
DATABASE_URL=postgres://user:pass@localhost:5432/dbname
NODE_ENV=development
DEBUG_AUTH=1  # Optional: For detailed auth logging
```

## License
MIT
