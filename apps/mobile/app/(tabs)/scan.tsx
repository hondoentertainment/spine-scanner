import { useCallback, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  isValidIsbn,
  lookupIsbnWithFallback,
  normalizeToIsbn13,
  upsertUserBook,
  type BookEntry,
} from '@spine/shared';

import { supabase } from '../../src/lib/supabase';
import { useAuthStore, useBookStore } from '../../src/store';
import { colors } from '../../src/theme';

function cleanIsbn(value: string): string {
  return value.replace(/[^0-9Xx]/g, '').replace(/x$/i, 'X');
}

function newId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID === 'function') return randomUUID.call(globalThis.crypto);
  return `book-${Date.now()}`;
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<BookEntry | null>(null);
  const books = useBookStore((state) => state.books);
  const addBook = useBookStore((state) => state.addBook);
  const user = useAuthStore((state) => state.user);
  const scanLock = useRef(false);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const lookup = useCallback(async (raw: string) => {
    if (scanLock.current) return;
    const isbn = cleanIsbn(raw);
    if (!isValidIsbn(isbn)) {
      setPending(null);
      setMessage('That code is not a valid ISBN-10 or ISBN-13.');
      return;
    }
    const canonical = normalizeToIsbn13(isbn);
    if (books.some((book) => normalizeToIsbn13(book.isbn) === canonical)) {
      setPending(null);
      setMessage('This ISBN is already in the library on this device.');
      return;
    }
    scanLock.current = true;
    setBusy(true);
    setMessage(null);
    setPending(null);
    try {
      const payload = await lookupIsbnWithFallback(canonical);
      if (!payload) {
        setMessage('No book found with this ISBN.');
        scanLock.current = false;
        return;
      }
      setPending({
        id: newId(),
        isbn: canonical,
        title: payload.title,
        author: payload.authors.join(', '),
        pageCount: payload.pageCount,
        amazonLink: `https://www.amazon.com/s?k=${encodeURIComponent(canonical)}`,
        coverImg: payload.thumbnail,
        status: 'to-read',
        notes: '',
        dateAdded: new Date().toISOString(),
        shelfIds: [],
        metadataSource: payload.source,
      });
    } catch {
      scanLock.current = false;
      setMessage('Failed to fetch book metadata.');
    } finally {
      setBusy(false);
    }
  }, [books]);

  const save = useCallback(async () => {
    if (!pending) return;
    addBook(pending);
    if (supabase && user?.id) {
      const error = await upsertUserBook(supabase, user.id, pending);
      setMessage(error ? `Saved on this device. Cloud save failed: ${error.message}` : 'Saved to your library.');
    } else {
      setMessage('Saved on this device. Sign in to copy it to your account.');
    }
    setPending(null);
    setManualIsbn('');
    scanLock.current = false;
  }, [addBook, pending, user]);

  return (
    <View style={styles.screen}>
      <Text style={styles.note}>Shelf photos are not in this build. Point the camera at an ISBN barcode.</Text>
      {permission?.granted && focused ? (
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }}
          onBarcodeScanned={busy || pending ? undefined : (scan) => { void lookup(scan.data); }}
        />
      ) : (
        <View style={styles.cameraFallback}>
          <Text style={styles.muted}>
            {permission?.granted ? 'Camera pauses when you leave Scan.' : 'Camera access is needed to read barcodes.'}
          </Text>
          {!permission?.granted ? (
            <Pressable style={styles.secondary} onPress={() => { void requestPermission(); }}>
              <Text style={styles.secondaryText}>Allow camera</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      <TextInput
        value={manualIsbn}
        onChangeText={setManualIsbn}
        placeholder="Or type an ISBN"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />
      <Pressable style={styles.secondary} onPress={() => { void lookup(manualIsbn); }} disabled={busy}>
        <Text style={styles.secondaryText}>{busy ? 'Looking up…' : 'Look up ISBN'}</Text>
      </Pressable>

      {message ? <Text style={styles.message}>{message}</Text> : null}
      {pending ? (
        <View style={styles.card}>
          <Text style={styles.title}>{pending.title}</Text>
          <Text style={styles.muted}>{pending.author}</Text>
          <Text style={styles.muted}>{pending.isbn} · {pending.pageCount || '—'} pages</Text>
          <Pressable style={styles.button} onPress={() => { void save(); }}>
            <Text style={styles.buttonText}>Add to library</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              setPending(null);
              scanLock.current = false;
            }}
          >
            <Text style={styles.secondaryText}>Scan a different book</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 12 },
  note: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  camera: { height: 220, borderRadius: 16, overflow: 'hidden' },
  cameraFallback: {
    height: 220,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  secondary: { backgroundColor: colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  secondaryText: { color: colors.text, fontWeight: '600' },
  message: { color: colors.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 6, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  button: { marginTop: 8, backgroundColor: colors.accent, borderRadius: 12, padding: 12, alignItems: 'center' },
  buttonText: { color: colors.accentText, fontWeight: '700' },
});
