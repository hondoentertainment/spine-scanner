# Supabase Auth Setup

Spine Scanner stays local-only until Supabase is configured. Google sign-in uses Supabase Auth: `signInWithOAuth({ provider: 'google' })` with the PKCE flow and a same-window redirect back to the app. That path works in a desktop tab and in the installed PWA (iOS opens Google in Safari, then the app reads the session when you return). The Google client secret is stored only in Supabase.

## What the Vercel project already has

Checked project `spine-scanner` (`prj_OFj2k0ujYeJxumlVP8JUJbte4yaj`) on team `team_CAcqm20HCv68FPpjwpyKEJou`:

Already set for Production and Preview:

- `VITE_SITE_URL` = `https://spine-scanner.vercel.app`
- `VITE_BASE_PATH` = `/`
- `VITE_ENABLE_SCANNER_DEBUG` = `false`
- `VITE_APP_ENV` = `production` on Production, `preview` on Preview

Not set (and no hidden production secrets):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

`spine-scanner-1` has no env vars. https://spine-scanner.vercel.app stays local-only until the two Supabase variables exist on `spine-scanner` and the app is redeployed.

GitHub Pages is built in Actions without those variables, so that deploy stays local-only too.

## 1. Google Cloud OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. APIs & Services → OAuth consent screen. Configure it if this project has never asked for one. Scopes `openid`, `email`, and `profile` are enough.
3. APIs & Services → Credentials → Create credentials → **OAuth client ID**.
4. Application type: **Web application**.
5. Authorized JavaScript origins. Google Cloud does **not** accept wildcard origins. Add each origin that will start sign-in:
   - `https://spine-scanner.vercel.app`
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - Every Vercel preview origin you will test, copied from that deployment's URL. Preview hosts look like `https://spine-scanner-git-<branch>-<team>.vercel.app` or `https://spine-scanner-<hash>-<team>.vercel.app`.
6. Authorized redirect URIs. Add only the Supabase callback. The app URL is not a Google redirect URI:
   - `https://inkbptoncwddalecisyk.supabase.co/auth/v1/callback`
7. Copy the client ID and client secret. Do not commit them and do not put them in Vite or Vercel.

## 2. Enable Google in Supabase

1. Supabase Dashboard → Authentication → Providers → **Google**.
2. Enable the provider.
3. Paste the Google client ID and client secret.
4. Enable **Skip nonce check**. Without this, Google sign-in from an installed iPhone PWA fails after the redirect with a nonce mismatch. The app still uses PKCE.

## 3. Supabase Site URL and redirect allow list

Authentication → URL Configuration:

- **Site URL:** `https://spine-scanner.vercel.app`
- **Redirect URLs:**
  - `https://spine-scanner.vercel.app/**`
  - `https://*.vercel.app/**`
  - `http://localhost:5173/**`
  - `spinescanner://auth/callback` (iOS development or store build)

The app sets `redirectTo` from `window.location.origin` plus the path you were on. On Vercel that origin is `https://spine-scanner.vercel.app`. On a preview it is that deployment's host. On the Vite dev server it is `http://localhost:5173`. After Google returns, the app exchanges the PKCE `code` (or reads a hash session), strips `?code` and `#access_token`, and opens the page you started on.

If Google is not enabled yet, Supabase returns `Unsupported provider: provider is not enabled`. The sign-in screen shows "Google sign-in isn't available for this app yet. You can still sign in with email." and does not stay on the error URL. The same happens for `error` and `error_description` in the query string or the hash.

## 4. Vercel env vars

In the Vercel project **spine-scanner**, set both for **Production** and **Preview**, then redeploy:

```
VITE_SUPABASE_URL=https://inkbptoncwddalecisyk.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key from Supabase → Project Settings → API>
```

The anon key is the public client key. The Google client secret stays in the Supabase Google provider. Do not set `VITE_E2E_HOOKS` (that flag is only for the Playwright build).

Local `.env` uses the same two variables. See `.env.example`. Leave both empty to run local-only.

## What you should see

- Signed out, Supabase configured: a **Continue with Google** button on Profile and in the header, plus "Use email instead".
- Signed in: avatar, name, and email, and Sign out.
- Signed out, or Supabase not configured: no Google button. Profile says cloud sign-in isn't set up, and the library stays on the device.
- First sign-in with books already on the device: a merge prompt. Merge keeps device books and cloud books. Not now leaves them on the device.

## iOS installed app

The button navigates this window to Google (`skipBrowserRedirect` so a popup cannot drop the PKCE verifier). iOS may open that page in Safari. Finish there, then return to the home-screen app. The app reads the session again when it becomes visible. localStorage holds the PKCE verifier so the code exchange can finish on this origin. If a future iOS version splits the installed app's storage from Safari, sign-in still completes in the browser tab that shares storage with the verifier.
