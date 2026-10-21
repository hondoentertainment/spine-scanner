export interface AccountIdentity {
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface IdentityUser {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

interface IdentityProfile {
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Name, email, and avatar for a signed-in reader, including Google profile fields. */
export function accountIdentity(
  user: IdentityUser | null | undefined,
  profile: IdentityProfile | null | undefined,
): AccountIdentity {
  const meta = user?.user_metadata ?? {};
  const email = text(user?.email) || text(meta.email);
  const name = text(profile?.username)
    || text(profile?.displayName)
    || text(meta.full_name)
    || text(meta.name)
    || 'Signed in';
  const avatarUrl = text(profile?.avatarUrl) || text(meta.avatar_url) || text(meta.picture) || null;
  return { name, email, avatarUrl };
}
