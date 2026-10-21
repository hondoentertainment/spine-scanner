import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuthStore, useBookStore } from '../../src/store';
import { colors } from '../../src/theme';

export default function HomeScreen() {
  const books = useBookStore((state) => state.books);
  const user = useAuthStore((state) => state.user);
  const reading = books.filter((book) => book.status === 'reading');
  const finished = books.filter((book) => book.status === 'read').length;

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>Spine Scanner</Text>
      <Text style={styles.title}>{user?.email ? `Hello, ${user.email}` : 'Your shelf'}</Text>
      <Text style={styles.subtitle}>
        Scan an ISBN to add a book. This device keeps the library you have loaded, and a signed-in account can refresh it from Supabase.
      </Text>

      <View style={styles.row}>
        <Stat label="Books" value={String(books.length)} />
        <Stat label="Reading" value={String(reading.length)} />
        <Stat label="Finished" value={String(finished)} />
      </View>

      <Text style={styles.section}>Continue</Text>
      {reading.length === 0 ? (
        <Text style={styles.muted}>Nothing is marked as reading yet.</Text>
      ) : (
        reading.slice(0, 3).map((book) => (
          <View key={book.id} style={styles.card}>
            <Text style={styles.cardTitle}>{book.title}</Text>
            <Text style={styles.muted}>{book.author}</Text>
          </View>
        ))
      )}

      <Pressable style={styles.button} onPress={() => router.push('/scan')}>
        <Text style={styles.buttonText}>Scan a barcode</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 20, gap: 12 },
  kicker: { color: colors.accent, fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '700' },
  section: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 8 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: colors.muted, fontSize: 14 },
  button: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { color: colors.accentText, fontWeight: '700', fontSize: 16 },
});
