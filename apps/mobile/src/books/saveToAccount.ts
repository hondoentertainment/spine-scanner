import { upsertUserBook, type BookEntry } from '@spine/shared';

import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store';

/** Upload one book when someone is signed in. Returns the cloud error, or null when saved or skipped. */
export async function saveBookToAccount(book: BookEntry): Promise<string | null> {
  const userId = useAuthStore.getState().user?.id;
  if (!supabase || !userId) return null;
  const error = await upsertUserBook(supabase, userId, book);
  return error ? error.message : null;
}
