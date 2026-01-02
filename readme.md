# 🛍️ Shopify Base App

A production-ready, modular Shopify App built with **Node.js (Express)** and **React (Vite + Polaris)**. Designed to pass Shopify App Store review with best practices for authentication, billing, webhooks, and database management.

---

## ✨ Features

- ✅ **Session Token Authentication** - App Bridge 4.x compliant
- ✅ **Shopify Polaris UI** - App Store approved design system
- ✅ **Repository Pattern** - Clean separation of concerns (DB, Services, Routes)
- ✅ **Resilient GraphQL Client** - Auto-retry, throttling, and error handling
- ✅ **Webhook Handling** - HMAC verification, GDPR compliance
- ✅ **Billing System** - Subscription management ready
- ✅ **PostgreSQL Database** - Auto-migration, session storage
- ✅ **Centralized Constants** - SQL, GraphQL queries, Plans config

---

## 📂 Project Structure

```
shopify_base_app/
├── server/                    # Backend (Node.js + Express)
│   ├── config/                # Shopify App configuration
│   ├── constants/             # Plans, Status, Messages
│   ├── db/                    # Database layer
│   │   ├── repositories/      # Data access (Repository Pattern)
│   │   ├── queries.js         # SQL queries
│   │   └── index.js           # Connection pool
│   ├── graphql/               # GraphQL queries
│   ├── middleware/            # Error handling, logging
│   ├── routes/                # API endpoints
│   ├── services/              # Business logic
│   ├── utils/                 # Helpers (session, logger, GraphQL client)
│   ├── webhooks/              # Webhook handlers
│   └── index.js               # Entry point
├── ui/                        # Frontend (React + Vite + Polaris)
│   ├── pages/                 # Dashboard, Pricing
│   ├── hooks/                 # useApi, useTranslation
│   ├── utils/                 # authenticatedFetch
│   └── types/                 # TypeScript interfaces
└── README.md                  # This file
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Shopify Partner Account
- ngrok or Cloudflare Tunnel (for HTTPS)

### 1. Clone & Install

```bash
git clone <your-repo>
cd shopify_base_app

# Install backend dependencies
npm install

# Install frontend dependencies
cd ui
npm install
cd ..
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb shopify_base_app
```

### 3. Environment Variables

Create `.env` in the root directory:

```env
# Shopify App Credentials
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,write_products

# App URL (use ngrok URL for local dev)
HOST=https://your-app.ngrok.io

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/shopify_base_app

# Optional
NODE_ENV=development
DEBUG_AUTH=1
```

Create `ui/.env`:

```env
VITE_SHOPIFY_API_KEY=your_api_key
```

### 4. Start Tunnel (ngrok)

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and update `HOST` in `.env`.

### 5. Build Frontend

```bash
cd ui
npm run build
cd ..
```

### 6. Start Server

```bash
npm start
```

Server runs on `http://localhost:3000`.

### 7. Install App on Test Store

Go to: `https://your-test-store.myshopify.com/admin/oauth/authorize?client_id=YOUR_API_KEY`

---

## 🌐 Production Deployment (Render.com)

### Step 1: Prepare Repository

Ensure your code is pushed to GitHub/GitLab.

### Step 2: Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **New +** → **PostgreSQL**
3. Name: `shopify-base-app-db`
4. Plan: Free or Starter
5. Click **Create Database**
6. Copy the **Internal Database URL** (starts with `postgresql://`)

### Step 3: Create Web Service on Render

1. Click **New +** → **Web Service**
2. Connect your GitHub/GitLab repository
3. Configure:
   - **Name**: `shopify-base-app`
   - **Environment**: `Node`
   - **Build Command**: 
     ```bash
     npm install && cd ui && npm install && npm run build && cd ..
     ```
   - **Start Command**: 
     ```bash
     npm start
     ```
   - **Plan**: Free or Starter

### Step 4: Add Environment Variables

In Render dashboard, go to **Environment** tab and add:

```env
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,write_products
HOST=https://shopify-base-app.onrender.com
DATABASE_URL=<paste_internal_database_url>
NODE_ENV=production
```

### Step 5: Deploy

Click **Manual Deploy** → **Deploy latest commit**.

Wait for deployment to complete (~5 minutes).

### Step 6: Update Shopify App URLs

1. Go to [Shopify Partners](https://partners.shopify.com)
2. Apps → Your App → Configuration
3. Update:
   - **App URL**: `https://shopify-base-app.onrender.com`
   - **Allowed redirection URLs**:
     ```
     https://shopify-base-app.onrender.com/auth/callback
     https://shopify-base-app.onrender.com/auth/shopify/callback
     ```

### Step 7: Test Installation

Install on a development store and verify:
- ✅ OAuth flow completes
- ✅ Dashboard loads
- ✅ Webhooks are registered
- ✅ Database tables are created

---

## 🔧 Shopify CLI & TOML Configuration

### Using `shopify.app.toml`

The `server/shopify.app.toml` file is used by Shopify CLI for app configuration.

#### Update TOML File

Edit `server/shopify.app.toml`:

```toml
name = "my-shopify-app"
application_url = "https://shopify-base-app.onrender.com"

[access_scopes]
scopes = "read_products,write_products"

[auth]
redirect_urls = [
  "https://shopify-base-app.onrender.com/auth/callback"
]

[webhooks]
api_version = "2024-01"

[[webhooks.subscriptions]]
uri = "/webhooks"
topics = [ 
  "app/uninstalled",
  "app_subscriptions/update",
  "shop/update" 
]

[build]
dev_store_url = "your-dev-store.myshopify.com"
```

#### Shopify CLI Commands

**Install Shopify CLI:**
```bash
npm install -g @shopify/cli @shopify/app
```

**Login:**
```bash
shopify auth login
```

**Push Configuration:**
```bash
cd server
shopify app config push
```

**Deploy App:**
```bash
shopify app deploy
```

**Generate Extension:**
```bash
shopify app generate extension
```

---

## 📋 Shopify Partner Dashboard Setup

### 1. Create App

1. Go to [Shopify Partners](https://partners.shopify.com)
2. Apps → **Create app** → **Create app manually**
3. App name: `My Shopify App`

### 2. Configure App URLs

**App setup** tab:
- **App URL**: `https://shopify-base-app.onrender.com`
- **Allowed redirection URL(s)**:
  ```
  https://shopify-base-app.onrender.com/auth/callback
  https://shopify-base-app.onrender.com/auth/shopify/callback
  ```

### 3. Set App Scopes

**Configuration** → **App scopes**:
- Select required scopes (e.g., `read_products`, `write_products`)
- Click **Save**

### 4. Enable App Embed

**Configuration** → **Embedded app**:
- ✅ Enable "Embed app in Shopify admin"

### 5. Configure Webhooks (Optional)

**Configuration** → **Webhooks**:
- Add webhook subscriptions manually or let the app auto-register them via code

### 6. GDPR Webhooks (Mandatory for App Store)

Ensure these are handled in `server/webhooks/index.js`:
- `customers/data_request`
- `customers/redact`
- `shop/redact`

### 7. Get API Credentials

**Overview** tab:
- Copy **Client ID** (API Key)
- Copy **Client secret** (API Secret)
- Paste into `.env` file

---

## 🧪 Testing Checklist

Before submitting to App Store:

- [ ] App installs successfully on test store
- [ ] OAuth flow completes without errors
- [ ] Dashboard loads with Polaris UI
- [ ] Session tokens work (check Network tab)
- [ ] Webhooks are registered (check Shopify Admin → Settings → Notifications)
- [ ] GDPR webhooks respond with 200 OK
- [ ] Database tables are created automatically
- [ ] Billing page displays correctly
- [ ] No console errors in browser
- [ ] App works in embedded iframe (Shopify Admin)

---

## 🛠️ Customization Guide

### Add New Database Table

1. Add SQL in `server/db/queries.js`:
   ```javascript
   CREATE TABLE IF NOT EXISTS my_table (...)
   ```

2. Create repository in `server/db/repositories/myRepository.js`

3. Use in services

### Add New API Endpoint

1. Create route in `server/routes/myRoute.js`
2. Register in `server/index.js`:
   ```javascript
   import myRoutes from './routes/myRoute.js';
   app.use('/api/my-endpoint', protect, myRoutes);
   ```

### Add New UI Page

1. Create component in `ui/pages/MyPage.tsx`
2. Add route in `ui/App.tsx`:
   ```tsx
   <Route path="/my-page" element={<MyPage />} />
   ```

### Modify Subscription Plans

Edit `server/constants/plans.js`:

```javascript
export const PLAN_CONFIG = {
    FREE: { key: 'FREE', name: 'Free', price: 0, features: [...] },
    PRO: { key: 'PRO', name: 'Pro', price: 29.99, features: [...] },
    ENTERPRISE: { key: 'ENTERPRISE', name: 'Enterprise', price: 99.99, features: [...] }
};
```

---

## 📚 Key Files Reference

| File | Purpose |
|------|---------|
| `server/index.js` | Express server entry point |
| `server/config/shopify-app.js` | Shopify App configuration |
| `server/db/queries.js` | All SQL queries |
| `server/graphql/queries.js` | All GraphQL queries |
| `server/constants/plans.js` | Subscription plans config |
| `server/webhooks/index.js` | Webhook handlers |
| `ui/App.tsx` | React app entry |
| `ui/pages/Dashboard.tsx` | Main dashboard |
| `ui/hooks/useApi.ts` | API client hook |

---

## 🐛 Troubleshooting

### "Session not found" Error

**Cause**: Database not connected or session not stored.

**Fix**:
1. Check `DATABASE_URL` in `.env`
2. Verify PostgreSQL is running
3. Check server logs for DB errors

### "App Bridge not initialized"

**Cause**: App not loaded in Shopify Admin iframe.

**Fix**:
1. Access app via Shopify Admin (not direct URL)
2. Ensure `HOST` in `.env` matches actual URL
3. Check browser console for errors

### Webhooks Not Working

**Cause**: HMAC verification failing or URL not reachable.

**Fix**:
1. Ensure app URL is HTTPS
2. Check `server/webhooks/index.js` for errors
3. Test webhook manually via Shopify Admin

### CORS Errors

**Cause**: Incorrect `HOST` configuration.

**Fix**:
1. Update `HOST` in `.env` to match deployment URL
2. Restart server

---

## 📖 Documentation

- [Shopify App Development](https://shopify.dev/docs/apps)
- [Shopify Polaris](https://polaris.shopify.com/)
- [App Bridge](https://shopify.dev/docs/api/app-bridge)
- [Render.com Docs](https://render.com/docs)

---

## 📄 License

MIT

---

## 🤝 Contributing

This is a base template. Fork it, customize it, and build amazing Shopify apps!

---

**Built with ❤️ for Shopify Developers**
