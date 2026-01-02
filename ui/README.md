# Shopify Base App - UI

Shopify Polaris-based frontend for embedded Shopify apps.

## ✅ App Store Compliance

This UI is fully compliant with Shopify App Store requirements:

- ✅ Uses Shopify Polaris Design System
- ✅ Proper App Bridge initialization
- ✅ No custom headers (embedded-friendly)
- ✅ Loading states with skeletons
- ✅ Error handling with Banners
- ✅ Accessible components
- ✅ Professional billing UI

## 🚀 Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env` and fill in:
   ```env
   VITE_SHOPIFY_API_KEY=your_api_key_here
   ```

3. **Development**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   ```

## 📦 Key Dependencies

- `@shopify/polaris` - Shopify's design system
- `@shopify/polaris-icons` - Official icon set
- `@shopify/app-bridge-react` - Embedded app integration
- `react-router-dom` - Client-side routing

## 🎨 Design Principles

All UI follows Shopify Polaris guidelines:
- Consistent spacing and typography
- Native Shopify Admin look and feel
- Accessible by default
- Mobile-responsive

## 📄 Pages

- `/` - Dashboard (welcome screen with plan status)
- `/pricing` - Plan selection and billing info

## 🔧 Customization

To add new pages:
1. Create component in `pages/`
2. Add route in `App.tsx`
3. Use Polaris components for consistency

## License
MIT
