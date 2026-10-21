/**
 * Playwright-only hooks. Vite inlines VITE_E2E_HOOKS, and production builds
 * leave it unset so these reads are dead. Never set the flag on a deploy.
 */
export interface E2ESupabaseConfig {
  url: string;
  anonKey: string;
}

export interface E2EAuthSeed {
  id?: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

declare global {
  interface Window {
    __SPINE_E2E_SUPABASE__?: E2ESupabaseConfig;
    __SPINE_E2E_AUTH__?: E2EAuthSeed;
  }
}

export function e2eHooksEnabled(): boolean {
  return import.meta.env.VITE_E2E_HOOKS === 'true';
}

export function readE2ESupabaseConfig(hooksEnabled: boolean): E2ESupabaseConfig | null {
  if (!hooksEnabled || typeof window === 'undefined') return null;
  const config = window.__SPINE_E2E_SUPABASE__;
  if (!config?.url || !config?.anonKey) return null;
  return { url: config.url, anonKey: config.anonKey };
}

export function readE2EAuthSeed(hooksEnabled: boolean): E2EAuthSeed | null {
  if (!hooksEnabled || typeof window === 'undefined') return null;
  const seed = window.__SPINE_E2E_AUTH__;
  if (!seed?.email || !seed?.name) return null;
  return seed;
}
