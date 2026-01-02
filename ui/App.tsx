import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import enTranslations from '@shopify/polaris/locales/en.json';
import { Dashboard } from './pages/Dashboard';
import { Pricing } from './pages/Pricing';
import { Settings } from './pages/Settings';

const App = () => {
  // App Bridge is automatically initialized by Shopify when app is embedded
  // No manual Provider needed in App Bridge React 4.x

  return (
    <AppProvider i18n={enTranslations}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pricing" element={<Pricing />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
};

export default App;