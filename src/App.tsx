import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

// Two separate bundles: a volunteer's phone on a weak signal loads only the capture page.
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CapturePage = lazy(() => import('./pages/CapturePage'));

export default function App() {
  return (
    <Suspense fallback={<p role="status" className="app-loading">Loading…</p>}>
      <Routes>
        <Route path="/s/*" element={<CapturePage />} />
        <Route path="*" element={<AdminPage />} />
      </Routes>
    </Suspense>
  );
}
