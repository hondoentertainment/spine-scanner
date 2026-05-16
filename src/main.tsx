import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { initErrorMonitoring } from './lib/errorMonitoring.ts'
import { getRouterBasename } from './lib/routerBasename.ts'

// Start monitoring before React mounts so early render errors have a chance to attach to a release.
void initErrorMonitoring().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={getRouterBasename()}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  )
});

