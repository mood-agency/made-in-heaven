import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from '@/components/Layout';
import Dashboard from '@/components/Dashboard';
import UrlDetail from '@/components/UrlDetail';
import SettingsPanel from '@/components/SettingsPanel';

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/urls/:id" element={<UrlDetail />} />
            <Route path="/settings" element={<SettingsPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </TooltipProvider>
    </BrowserRouter>
  );
}
