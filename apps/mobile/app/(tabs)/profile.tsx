import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { emailAddressProblem, SPINE_MOBILE_GOOGLE_REDIRECT } from '@spine/shared';

import { googleRedirectUri, signInWithGoogle } from '../../src/auth/google';
import { isSupabaseConfigured } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/store';
import { colors } from '../../src/theme';

export default function ProfileScreen() {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const confirmationPending = useAuthStore((state) => state.confirmationPending);
  const magicLinkSent = useAuthStore((state) => state.magicLinkSent);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const signInWithMagicLink = useAuthStore((state) => state.signInWithMagicLink);
  const signOut = useAuthStore((state) => state.signOut);
  const clearError = useAuthStore((state) => state.clearError);
  const clearMagicLinkSent = useAuthStore((state) => state.clearMagicLinkSent);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const linkLock = useRef(false);
  const configured = isSupabaseConfigured();

  const sendMagicLink = () => {
    if (linkLock.current || linkBusy || loading) return;
    const problem = emailAddressProblem(email);
    setEmailError(problem);
    if (problem) {
      clearError();
      return;
    }
    linkLock.current = true;
    setLinkBusy(true);
    clearError();
    void signInWithMagicLink(email.trim(), SPINE_MOBILE_GOOGLE_REDIRECT).finally(() => {
      linkLock.current = false;
      setLinkBusy(false);
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {!configured ? (
        <Text style={styles.note}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to run cloud sign-in. The app still stores books on this device.
        </Text>
      ) : null}

      {user ? (
        <View style={styles.card}>
          <Text style={styles.title}>Signed in</Text>
          <Text style={styles.muted}>{user.email}</Text>
          <Pressable style={styles.secondary} onPress={() => { void signOut(); }}>
            <Text style={styles.secondaryText}>{loading ? 'Signing out…' : 'Sign out'}</Text>
          </Pressable>
        </View>
      ) : magicLinkSent ? (
        <View style={styles.card}>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.muted}>
            We sent a sign-in link to {email.trim()}. Open it on this phone to finish signing in.
          </Text>
          <Pressable
            style={styles.secondary}
            onPress={() => {
              clearMagicLinkSent();
              clearError();
            }}
          >
            <Text style={styles.secondaryText}>Use a different email</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Account</Text>
          <TextInput
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setEmailError(null);
            }}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            accessibilityLabel="Email"
            style={styles.input}
          />
          {emailError ? <Text style={styles.error}>{emailError}</Text> : null}
          <Pressable
            style={[styles.secondary, (linkBusy || loading) && styles.disabled]}
            disabled={linkBusy || loading}
            accessibilityState={{ busy: linkBusy, disabled: linkBusy || loading }}
            onPress={sendMagicLink}
          >
            <Text style={styles.secondaryText}>{linkBusy ? 'Sending link…' : 'Email me a sign-in link'}</Text>
          </Pressable>
          <Text style={styles.meta}>Opens {SPINE_MOBILE_GOOGLE_REDIRECT} after you tap the link.</Text>

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            accessibilityLabel="Password"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {confirmationPending ? <Text style={styles.note}>Check your email to confirm the account.</Text> : null}
          <Pressable
            style={[styles.button, loading && styles.disabled]}
            disabled={loading || linkBusy}
            onPress={() => {
              clearError();
              void signIn(email.trim(), password);
            }}
          >
            <Text style={styles.buttonText}>{loading && !linkBusy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, (loading || linkBusy) && styles.disabled]}
            disabled={loading || linkBusy}
            onPress={() => {
              clearError();
              void signUp(email.trim(), password);
            }}
          >
            <Text style={styles.secondaryText}>Create account</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, (googleBusy || loading) && styles.disabled]}
            disabled={googleBusy || loading}
            onPress={() => {
              if (googleBusy || loading) return;
              setGoogleError(null);
              setGoogleBusy(true);
              void signInWithGoogle().then((message) => {
                if (message) setGoogleError(message);
              }).finally(() => setGoogleBusy(false));
            }}
          >
            <Text style={styles.secondaryText}>{googleBusy ? 'Opening Google…' : 'Continue with Google'}</Text>
          </Pressable>
          {googleError ? <Text style={styles.error}>{googleError}</Text> : null}
          <Text style={styles.meta}>Redirect: {googleRedirectUri()}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Sign in with Apple</Text>
        <Text style={styles.muted}>
          Required on the App Store alongside Google. Not wired in this scaffold.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, padding: 16, gap: 12 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12 },
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
  disabled: { opacity: 0.6 },
});
