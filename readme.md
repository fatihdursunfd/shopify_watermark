# �️ Shopify Watermark App (Watermark Studio)

A production-ready, high-performance Shopify App designed to help merchants protect their product images with custom watermarks. Built with **Node.js (Express)**, **React (Vite + Polaris)**, and **BullMQ** for background processing.

---

## ✨ Features

- 🎨 **Watermark Studio** - Custom text or image watermarks with precise positioning.
- ⚡ **Bulk Processing** - Handle thousands of product images in the background using BullMQ.
- 🔄 **One-Click Rollback** - Easily revert back to original images if needed.
- ✅ **Session Token Authentication** - App Bridge 4.x compliant.
- ✅ **Shopify Polaris UI** - Seamlessly integrates with the Shopify Admin.
- ✅ **Resilient Queue System** - Redis-backed job processing with auto-retry logic.
- ✅ **Smart Scaling** - Designed to work within Shopify's GraphQL rate limits.

---

## 📂 Project Structure

```
watermark_app/
├── server/                    # Backend (Node.js + Express)
│   ├── config/                # Shopify & Redis configuration
│   ├── constants/             # Job Status, Queue Names, Limits
│   ├── db/                    # Database layer (PostgreSQL)
│   │   ├── repositories/      # Data access (Watermark Jobs, Settings, Shop)
│   │   ├── queries.js         # SQL queries
│   ├── graphql/               # GraphQL queries & mutations
│   ├── routes/                # API endpoints (Watermark Apply/Rollback/Settings)
│   ├── services/              # Core Logic
│   │   ├── watermark/         # Image processing engine (Sharp)
│   │   ├── watermarkQueue.js  # BullMQ Producers
│   │   ├── watermarkWorker.js # Image processing consumer
│   │   └── rollbackWorker.js  # Rollback consumer
│   └── index.js               # Entry point
├── ui/                        # Frontend (React + Vite + Polaris)
│   ├── pages/                 # Dashboard, Studio, Pricing, History
│   ├── hooks/                 # authenticatedFetch, useApi
│   └── components/            # Reusable UI elements
└── README.md                  # This file
```

---

## 🚀 Quick Start (Local Development)

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- **Redis 6+ (Required for Queues)**
- Shopify Partner Account
- ngrok or Cloudflare Tunnel

### 1. Clone & Install

```bash
git clone https://github.com/fatihdursunfd/shopify_watermark.git
cd shopify_watermark

# Install backend dependencies
npm install

# Install frontend dependencies
cd ui
npm install
cd ..
```

### 2. Database & Redis Setup

1. Create a PostgreSQL database called `shopify_watermark`.
2. Ensure Redis is running locally (`redis-server`).

### 3. Environment Variables

Create `.env` in the `server/` directory:

```env
# Shopify App Credentials
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=read_products,write_products,read_content,write_content

# App URL
HOST=https://your-app.ngrok.io

# Database & Redis
DATABASE_URL=postgresql://user:password@localhost:5432/shopify_watermark
REDIS_URL=redis://localhost:6379

NODE_ENV=development
```

### 4. Run Development

**Start Backend (with workers):**
```bash
cd server
npm run dev
```

**Start Frontend:**
```bash
cd ui
npm run dev
```

---

## 🌐 Production Deployment (Render.com)

### Step 1: Services Needed
1. **PostgreSQL**: Database for settings and job history.
2. **Redis**: Key-Value Store for BullMQ queues.
3. **Web Service**: Main app server and workers.

### Step 2: Build Command
```bash
npm install && cd ui && npm install && npm run build && cd ..
```

### Step 3: Web Service Config
- **Start Command**: `npm start` (This starts `node index.js` inside the server context)
- **Environment Variables**:
  - `REDIS_URL`: Your Redis connection string.
  - `DATABASE_URL`: Your PostgreSQL connection string.
  - `HOST`: `https://shopify-watermark.onrender.com`

---

## 🔧 Shopify CLI Usage

### Deploy App Configuration
```bash
cd server
shopify app config push
shopify app deploy
```

---

## 📋 Shopify Partner Dashboard
- **App URL**: `https://shopify-watermark.onrender.com`
- **Redirect URL**: `https://shopify-watermark.onrender.com/auth/callback`

---

## 🧪 Testing Checklist
- [ ] Install on test store.
- [ ] Configure watermark settings (Text/Image).
- [ ] Start a "Bulk Apply" job.
- [ ] Verify background progress in Dashboard.
- [ ] Check product images in Shopify Admin.
- [ ] Perform a "Rollback" and verify original images are restored.

---

## � License

MIT

---

**Built by [Fatih Dursun](https://github.com/fatihdursunfd)**
