import { StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { colors } from '../../src/theme';

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Returning from Google</Text>
      <Text style={styles.muted}>
        If the sign-in sheet is still open, you can close it. Your session is stored on this device when the code exchange succeeds.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24, gap: 12, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 22 },
});
