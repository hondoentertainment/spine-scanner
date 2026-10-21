import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { initErrorMonitoring } from './lib/errorMonitoring.ts'
import { getRouterBasename } from './lib/routerBasename.ts'
import { e2eHooksEnabled } from './lib/e2eHooks.ts'

if (e2eHooksEnabled()) {
  document.documentElement.dataset.e2eHooks = 'true';
}

// Initialize error monitoring (no-op if VITE_SENTRY_DSN is not set)
initErrorMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
