import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AnalyticsConsent = 'unknown' | 'granted' | 'denied';

interface ConsentStore {
  analyticsConsent: AnalyticsConsent;
  setAnalyticsConsent: (value: Exclude<AnalyticsConsent, 'unknown'>) => void;
}

export const useConsentStore = create<ConsentStore>()(
  persist(
    (set) => ({
      analyticsConsent: 'unknown',
      setAnalyticsConsent: (value) => set({ analyticsConsent: value }),
    }),
    { name: 'spine-scanner-consent-v1' },
  ),
);
