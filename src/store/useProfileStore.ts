import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase.ts';
import { getProfile, upsertProfile } from '../lib/profiles.ts';
import type { ProfilePreferences } from '../types.ts';
import { DEFAULT_PREFERENCES } from '../types.ts';

const STORAGE_KEY = 'spine-scanner-preferences';

interface ProfileStore {
  preferences: ProfilePreferences;
  /** Called when user logs in to hydrate from cloud */
  hydrateFromProfile: (prefs: ProfilePreferences | null) => void;
  updatePreferences: (partial: Partial<ProfilePreferences>) => void;
  /** Load preferences from Supabase for signed-in user */
  loadFromCloud: (userId: string) => Promise<void>;
  /** Save preferences to Supabase when signed in */
  saveToCloud: (userId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>()(
    persist(
    (set, get) => ({
      preferences: { ...DEFAULT_PREFERENCES },

      hydrateFromProfile: (prefs) => {
        if (prefs) {
          set({ preferences: { ...DEFAULT_PREFERENCES, ...prefs } });
        }
      },

      updatePreferences: (partial) => {
        set((state) => ({
          preferences: { ...state.preferences, ...partial },
        }));
      },

      loadFromCloud: async (userId) => {
        if (!supabase) return;
        const profile = await getProfile(userId);
        if (profile?.preferences) {
          set((state) => ({
            preferences: { ...DEFAULT_PREFERENCES, ...state.preferences, ...profile.preferences },
          }));
        }
      },

      saveToCloud: async (userId) => {
        if (!supabase) return;
        await upsertProfile(userId, { preferences: get().preferences });
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({ preferences: state.preferences }),
      merge: (persisted, current) => {
        // Only merge `preferences` — persisted JSON may include zustand/version keys; spreading the whole object corrupts actions.
        const prefs = (persisted as { preferences?: ProfilePreferences } | undefined)?.preferences;
        return {
          ...current,
          preferences: { ...DEFAULT_PREFERENCES, ...current.preferences, ...prefs },
        };
      },
    }
  )
);
