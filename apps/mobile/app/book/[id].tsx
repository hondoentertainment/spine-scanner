import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatLentSince,
  formatPhysicalLocation,
  isOnLoan,
  loanBadgeText,
  returnedLoans,
} from '@spine/shared';

import { saveBookToAccount } from '../../src/books/saveToAccount';
import { useAuthStore, useBookStore } from '../../src/store';
import { colors } from '../../src/theme';

function paramId(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? '';
  return '';
}

const DUE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function BookScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = paramId(params.id);
  const book = useBookStore((state) => state.books.find((entry) => entry.id === id));
  const lendBook = useBookStore((state) => state.lendBook);
  const markBookReturned = useBookStore((state) => state.markBookReturned);
  const updateBook = useBookStore((state) => state.updateBook);
  const user = useAuthStore((state) => state.user);
  const [borrower, setBorrower] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [room, setRoom] = useState(book?.locationRoom ?? '');
  const [bookcase, setBookcase] = useState(book?.locationCase ?? '');
  const [shelf, setShelf] = useState(book?.locationShelf ?? '');
  const [draftBookId, setDraftBookId] = useState(book?.id ?? '');
  if (book && book.id !== draftBookId) {
    setDraftBookId(book.id);
    setRoom(book.locationRoom ?? '');
    setBookcase(book.locationCase ?? '');
    setShelf(book.locationShelf ?? '');
  }
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const persist = async (bookId: string) => {
    const updated = useBookStore.getState().books.find((entry) => entry.id === bookId);
    if (!updated) return;
    if (!user) {
      setNote('Saved on this device. Sign in, then refresh the library to copy it to your account.');
      return;
    }
    setSaving(true);
    const cloudError = await saveBookToAccount(updated);
    setSaving(false);
    setNote(cloudError ? `Saved on this device. Cloud save failed: ${cloudError}` : 'Saved to your library.');
  };

  if (!book) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>That book is not on this device.</Text>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Back to library</Text>
        </Pressable>
      </View>
    );
  }

  const onLoan = isOnLoan(book);
  const place = formatPhysicalLocation(book);
  const past = returnedLoans(book);

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{book.title || 'Untitled'}</Text>
      <Text style={styles.muted}>{book.author || 'Unknown author'}</Text>
      <Text style={styles.meta}>{book.isPhotoOnly ? 'Photo' : book.isbn} · {book.status}</Text>
      {book.needsReview ? <Text style={styles.review}>Needs review</Text> : null}
      {book.reviewReason ? <Text style={styles.muted}>{book.reviewReason}</Text> : null}
      {place ? <Text style={styles.muted}>{place}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.section}>Loan</Text>
        {onLoan ? (
          <>
            <Text style={styles.loan}>{loanBadgeText(book) ?? 'Lent out'}</Text>
            <Text style={styles.muted}>{formatLentSince(book)}</Text>
            <Pressable
              style={styles.button}
              disabled={saving}
              onPress={() => {
                setFormError(null);
                markBookReturned(book.id);
                void persist(book.id);
              }}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Mark returned'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={borrower}
              onChangeText={(value) => {
                setBorrower(value);
                setFormError(null);
              }}
              placeholder="Who has it?"
              placeholderTextColor={colors.muted}
              autoCorrect={false}
              accessibilityLabel="Borrower name"
              style={styles.input}
            />
            <TextInput
              value={dueDate}
              onChangeText={(value) => {
                setDueDate(value);
                setFormError(null);
              }}
              placeholder="Due date (YYYY-MM-DD)"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Loan due date"
              style={styles.input}
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable
              style={styles.button}
              disabled={saving}
              onPress={() => {
                const name = borrower.trim();
                if (!name) {
                  setFormError('Enter who has this book.');
                  return;
                }
                const due = dueDate.trim();
                if (due && !DUE_DATE.test(due)) {
                  setFormError('Enter the due date as YYYY-MM-DD.');
                  return;
                }
                setFormError(null);
                lendBook(book.id, { lentTo: name, dueAt: due || null });
                setBorrower('');
                setDueDate('');
                void persist(book.id);
              }}
            >
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Lend book'}</Text>
            </Pressable>
          </>
        )}
        {past.map((entry) => (
          <Text key={`${entry.lentAt}-${entry.returnedAt}-${entry.lentTo}`} style={styles.meta}>
            Returned from {entry.lentTo}
          </Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.section}>Shelf location</Text>
        <TextInput
          value={room}
          onChangeText={setRoom}
          placeholder="Room"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Location room"
          style={styles.input}
        />
        <TextInput
          value={bookcase}
          onChangeText={setBookcase}
          placeholder="Case"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Location case"
          style={styles.input}
        />
        <TextInput
          value={shelf}
          onChangeText={setShelf}
          placeholder="Shelf"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Location shelf"
          style={styles.input}
        />
        <Pressable
          style={styles.button}
          disabled={saving}
          onPress={() => {
            setFormError(null);
            updateBook(book.id, {
              locationRoom: room.trim(),
              locationCase: bookcase.trim(),
              locationShelf: shelf.trim(),
            });
            void persist(book.id);
          }}
        >
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save location'}</Text>
        </Pressable>
      </View>

      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, padding: 16, gap: 10 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12 },
  loan: { color: colors.text, fontSize: 16, fontWeight: '700' },
  review: {
    alignSelf: 'flex-start',
    color: '#78350f',
    backgroundColor: '#fde68a',
    overflow: 'hidden',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  error: { color: colors.danger, fontSize: 14 },
  input: {
    backgroundColor: colors.background,
    color: colors.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: colors.accentText, fontWeight: '700' },
  secondary: { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600' },
});
