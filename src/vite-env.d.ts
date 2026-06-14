/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_BASE_PATH?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_ENABLE_SCANNER_DEBUG?: string;
  readonly VITE_AMAZON_AFFILIATE_TAG?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_RELEASE?: string;
  readonly VITE_APP_ENV?: string;
  /** Set to `mvp` for a reduced shell (scan-first, lean profile). Omit or any other value = full UI. */
  readonly VITE_APP_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Chromium PWA install prompt (not in all TS DOM libs). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
