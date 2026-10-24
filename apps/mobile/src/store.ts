import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';
import { createAuthStore, createLibraryStore } from '@spine/shared';
import { supabase } from './lib/supabase';

export const useBookStore = createLibraryStore({
  storage: createJSONStorage(() => AsyncStorage),
});

export const useAuthStore = createAuthStore(() => supabase, {
  onAccountChange: (userId) => {
    useBookStore.getState().claimAccount(userId);
  },
});
