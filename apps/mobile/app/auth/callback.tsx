import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router, useLocalSearchParams } from 'expo-router';
import { resolveAuthCallbackUrl } from '@spine/shared';

import { finishAuthCallback } from '../../src/auth/session';
import { useAuthStore } from '../../src/store';
import { colors } from '../../src/theme';

WebBrowser.maybeCompleteAuthSession();

function firstParam(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  return null;
}

export default function AuthCallbackScreen() {
  const linkingUrl = Linking.useURL();
  const params = useLocalSearchParams();
  const user = useAuthStore((state) => state.user);
  const [finishedUrl, setFinishedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callbackUrl = resolveAuthCallbackUrl(linkingUrl, {
    code: firstParam(params.code),
    accessToken: firstParam(params.access_token),
    refreshToken: firstParam(params.refresh_token),
    error: firstParam(params.error),
    errorDescription: firstParam(params.error_description),
  });
  const busy = Boolean(callbackUrl) && finishedUrl !== callbackUrl;
  const visibleError = finishedUrl === callbackUrl ? error : null;

  useEffect(() => {
    if (!callbackUrl) return;
    let cancelled = false;
    void finishAuthCallback(callbackUrl).then((result) => {
      if (cancelled) return;
      setFinishedUrl(callbackUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      if (result.handled && useAuthStore.getState().user) {
        router.replace('/(tabs)/profile');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [callbackUrl]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{visibleError ? 'Sign-in did not finish' : 'Signing in'}</Text>
      {busy ? <ActivityIndicator color={colors.accent} /> : null}
      <Text style={styles.muted}>
        {visibleError
          ?? (user
            ? 'You are signed in. Your library stays on this device until you refresh it.'
            : 'If a sign-in sheet is still open, you can close it. A magic link or Google return is stored on this device when the code exchange succeeds.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24, gap: 12, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 16, lineHeight: 22 },
});
