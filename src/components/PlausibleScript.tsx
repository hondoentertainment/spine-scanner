import { useEffect } from 'react';

const SCRIPT_ID = 'plausible-analytics';

/**
 * Loads Plausible when `enabled` and `VITE_PLAUSIBLE_DOMAIN` are set.
 * Use with explicit consent (see AnalyticsConsentBanner).
 */
export default function PlausibleScript({ enabled }: { enabled: boolean }) {
  const domain = (import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined)?.trim();
  const scriptSrc =
    (import.meta.env.VITE_PLAUSIBLE_SCRIPT_SRC as string | undefined)?.trim() ||
    'https://plausible.io/js/script.js';

  useEffect(() => {
    if (!enabled || !domain) return;

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.defer = true;
    script.setAttribute('data-domain', domain);
    script.src = scriptSrc;
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [enabled, domain, scriptSrc]);

  return null;
}
