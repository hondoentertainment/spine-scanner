import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * SecureStore rejects values over 2048 bytes. A Supabase session is often larger,
 * so those payloads live in AsyncStorage and the secure copy is removed.
 */
const SECURE_STORE_LIMIT = 2048;

async function deleteSecure(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Some OS versions reject a delete when the key is already gone.
  }
}

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const secure = await SecureStore.getItemAsync(key);
    if (secure != null) return secure;
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= SECURE_STORE_LIMIT) {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, value);
    await deleteSecure(key);
  },
  async removeItem(key: string): Promise<void> {
    await deleteSecure(key);
    await AsyncStorage.removeItem(key);
  },
};
