import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  fetchUserBooks,
  fetchUserShelves,
  mergePulledLibrary,
  upsertUserBooks,
  upsertUserShelves,
} from '@spine/shared';

import { supabase } from '../../src/lib/supabase';
import { useAuthStore, useBookStore } from '../../src/store';
import { colors } from '../../src/theme';

export default function LibraryScreen() {
  const books = useBookStore((state) => state.books);
  const setBooks = useBookStore((state) => state.setBooks);
  const setShelves = useBookStore((state) => state.setShelves);
  const user = useAuthStore((state) => state.user);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !user?.id) {
      setNote(null);
      setError(user ? null : 'Sign in to load the books saved to your account.');
      return;
    }
    setRefreshing(true);
    setError(null);
    setNote(null);
    const localBooks = useBookStore.getState().books;
    const localShelves = useBookStore.getState().shelves;
    const [bookResult, shelfResult] = await Promise.all([
      fetchUserBooks(supabase, user.id),
      fetchUserShelves(supabase, user.id),
    ]);
    if (bookResult.error) {
      setError(bookResult.error.message);
      setRefreshing(false);
      return;
    }

    const remoteShelves = shelfResult.error ? localShelves : shelfResult.data;
    const merged = mergePulledLibrary(localBooks, bookResult.data, localShelves, remoteShelves);
    setBooks(merged.books);
    if (!shelfResult.error) setShelves(merged.shelves);

    const bookSaveError = await upsertUserBooks(supabase, user.id, merged.books);
    const shelfSaveError = shelfResult.error
      ? null
      : await upsertUserShelves(supabase, user.id, merged.shelves);

    if (bookSaveError) {
      setError(`Loaded your library. Cloud save failed: ${bookSaveError.message}`);
    } else if (shelfSaveError) {
      setError(`Loaded your library. Shelf save failed: ${shelfSaveError.message}`);
    } else if (shelfResult.error) {
      setError(shelfResult.error.message);
    } else {
      const remoteIds = new Set(bookResult.data.map((book) => book.id));
      const kept = localBooks.filter((book) => !remoteIds.has(book.id)).length;
      if (kept > 0) {
        setNote(
          kept === 1
            ? 'Kept 1 book that was only on this device and copied it to your account.'
            : `Kept ${kept} books that were only on this device and copied them to your account.`,
        );
      }
    }
    setRefreshing(false);
  }, [setBooks, setShelves, user]);

  return (
    <View style={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <FlatList
        data={books}
        keyExtractor={(book) => book.id}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={colors.accent} />
        )}
        ListEmptyComponent={(
          <Text style={styles.muted}>
            No books on this device yet. Scan an ISBN, or pull down after you sign in.
          </Text>
        )}
        contentContainerStyle={books.length === 0 ? styles.empty : styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title || 'Untitled'}</Text>
            <Text style={styles.muted}>{item.author || 'Unknown author'}</Text>
            <Text style={styles.meta}>{item.isbn} · {item.status}</Text>
          </View>
        )}
      />
      {user ? (
        <Pressable style={styles.button} onPress={() => { void refresh(); }}>
          <Text style={styles.buttonText}>Refresh from cloud</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  empty: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
    marginBottom: 10,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12 },
  error: { color: colors.danger, paddingHorizontal: 16, paddingTop: 12 },
  note: { color: colors.muted, paddingHorizontal: 16, paddingTop: 12, fontSize: 14, lineHeight: 20 },
  button: { margin: 16, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.text, fontWeight: '600' },
});
