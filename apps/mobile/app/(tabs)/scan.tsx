import { useCallback, useRef, useState } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  createPhotoOnlyBook,
  isValidIsbn,
  lookupIsbnWithFallback,
  normalizeToIsbn13,
  type BookEntry,
} from '@spine/shared';

import { pickBookPhoto } from '../../src/books/pickBookPhoto';
import { saveBookToAccount } from '../../src/books/saveToAccount';
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
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
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

  const saveBook = useCallback(async (book: BookEntry) => {
    addBook(book);
    const cloudError = await saveBookToAccount(book);
    if (!user) {
      setMessage('Saved on this device. Sign in to copy it to your account.');
    } else if (cloudError) {
      setMessage(`Saved on this device. Cloud save failed: ${cloudError}`);
    } else {
      setMessage('Saved to your library.');
    }
  }, [addBook, user]);

  const save = useCallback(async () => {
    if (!pending) return;
    await saveBook(pending);
    setPending(null);
    setManualIsbn('');
    scanLock.current = false;
  }, [pending, saveBook]);

  const choosePhoto = useCallback(async (source: 'camera' | 'library') => {
    if (pickerBusy || photoBusy) return;
    setPickerBusy(true);
    setMessage(null);
    try {
      const picked = await pickBookPhoto(source);
      if ('error' in picked) {
        setMessage(picked.error);
        return;
      }
      if ('cancelled' in picked) return;
      setPhoto(picked.coverImg);
      setPending(null);
      scanLock.current = false;
    } catch {
      setMessage('Could not open that photo. Try again.');
    } finally {
      setPickerBusy(false);
    }
  }, [photoBusy, pickerBusy]);

  const savePhoto = useCallback(async () => {
    if (!photo || photoBusy) return;
    setPhotoBusy(true);
    try {
      await saveBook(createPhotoOnlyBook({ id: newId(), title: photoTitle, coverImg: photo }));
      setPhoto(null);
      setPhotoTitle('');
    } finally {
      setPhotoBusy(false);
    }
  }, [photo, photoBusy, photoTitle, saveBook]);

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.note}>
        Add one book from a photo. The title is optional. A shelf photo with more than one book is not recognized in this build.
      </Text>
      <View style={styles.row}>
        <Pressable style={styles.secondaryFlex} disabled={pickerBusy || photoBusy} onPress={() => { void choosePhoto('camera'); }}>
          <Text style={styles.secondaryText}>{pickerBusy ? 'Opening…' : 'Take photo'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryFlex} disabled={pickerBusy || photoBusy} onPress={() => { void choosePhoto('library'); }}>
          <Text style={styles.secondaryText}>{pickerBusy ? 'Opening…' : 'Choose photo'}</Text>
        </Pressable>
      </View>
      {photo ? (
        <View style={styles.card}>
          <Image source={{ uri: photo }} style={styles.preview} accessibilityLabel="Selected book photo" />
          <TextInput
            value={photoTitle}
            onChangeText={setPhotoTitle}
            placeholder="Title (optional)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Photo book title"
            style={styles.input}
          />
          <Pressable style={styles.button} disabled={photoBusy} onPress={() => { void savePhoto(); }}>
            <Text style={styles.buttonText}>{photoBusy ? 'Saving…' : 'Add photo book'}</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              setPhoto(null);
              setPhotoTitle('');
            }}
          >
            <Text style={styles.secondaryText}>Discard photo</Text>
          </Pressable>
        </View>
      ) : null}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, padding: 16, gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  secondaryFlex: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  preview: { height: 160, borderRadius: 12, backgroundColor: colors.background },
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
