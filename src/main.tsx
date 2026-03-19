import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { initErrorMonitoring } from './lib/errorMonitoring.ts'

// Initialize error monitoring (no-op if VITE_SENTRY_DSN is not set)
initErrorMonitoring();

// Request persistent storage so the browser does not evict localStorage
// under low-memory pressure. Fire-and-forget — no UX impact if denied.
if (typeof navigator !== 'undefined' && 'storage' in navigator && 'persist' in navigator.storage) {
  void navigator.storage.persist();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
