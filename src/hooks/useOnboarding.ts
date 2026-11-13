import { useCallback, useEffect, useState } from 'react';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { isMvpMode } from '../lib/appMode.ts';
import { useBookStore } from '../store/useBookStore.ts';
import { useProfileStore } from '../store/useProfileStore.ts';

export function useOnboarding(publicPage: PublicPage | null) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { books } = useBookStore();
  const { preferences, updatePreferences } = useProfileStore();

  useEffect(() => {
    if (!preferences.onboardingCompleted && books.length > 0) {
      updatePreferences({ onboardingCompleted: true });
    }
  }, [preferences.onboardingCompleted, books.length, updatePreferences]);

  useEffect(() => {
    if (isMvpMode()) {
      setShowOnboarding(false);
      return;
    }
    if (publicPage) {
      setShowOnboarding(false);
      return;
    }

    if (!preferences.onboardingCompleted && books.length === 0) {
      setShowOnboarding(true);
    }
  }, [preferences.onboardingCompleted, books.length, publicPage]);

  const completeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    updatePreferences({ onboardingCompleted: true });
  }, [updatePreferences]);

  return { showOnboarding, completeOnboarding };
}
