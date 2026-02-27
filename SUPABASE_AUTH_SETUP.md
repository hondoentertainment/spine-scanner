# Supabase Auth Setup

This guide covers configuring Supabase Authentication for Spine Scanner, including Google OAuth.

## Environment Variables

Add these to your `.env` (or `.env.local`):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

You can find these values in: Supabase Dashboard → Project Settings → API.

---

## Google OAuth

### 1. Enable Google in Supabase

1. Go to **Supabase Dashboard** → **Authentication** → **Providers**
2. Enable the **Google** provider
3. You will need a Google OAuth Client ID and Secret from Google Cloud Console (see step 3)

### 2. Configure Redirect URLs in Supabase

In **Authentication** → **URL Configuration**, add:

- **Site URL**: Your production app URL (e.g. `https://your-app.vercel.app`)
- **Redirect URLs** (allow list):
  - `{SUPABASE_URL}/auth/v1/callback` (Supabase handles OAuth callback here; this is often pre-configured)
  - Your app origin(s), for example:
    - `http://localhost:5173` (Vite dev server)
    - `http://localhost:5173/spine-scanner` (if using subpath)
    - `https://your-app.vercel.app` (production)

The app uses `redirectTo` when calling `signInWithOAuth`, so the URL you add must match where users land after Google signs them in.

### 3. Create Google OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - Your production origin (e.g. `https://your-app.vercel.app`)
7. Add **Authorized redirect URIs**:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Replace `YOUR_PROJECT_REF` with your Supabase project reference (from your Supabase URL)

8. Copy the **Client ID** and **Client Secret**
9. Paste them into Supabase: **Authentication** → **Providers** → **Google**

---

## OAuth User Profile Data

After signing in with Google (or other OAuth providers), the user object includes:

- `user.email`
- `user.user_metadata.avatar_url` – profile picture
- `user.user_metadata.full_name` – display name

These fields can be used to populate the user profile (e.g. avatar and display name in the auth badge).

---

## Email/Password Auth

Email/password sign-up and sign-in work out of the box once Supabase is configured. No extra setup required beyond the env vars above.
