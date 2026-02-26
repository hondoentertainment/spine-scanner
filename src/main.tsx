import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { initErrorMonitoring } from './lib/errorMonitoring.ts'

// Initialize error monitoring (no-op if VITE_SENTRY_DSN is not set)
initErrorMonitoring();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
)
