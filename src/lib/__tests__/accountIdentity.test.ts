import { describe, expect, it } from 'vitest';
import { accountIdentity } from '../accountIdentity';

describe('accountIdentity', () => {
  it('prefers a chosen username, then the Google name, and always keeps email', () => {
    expect(accountIdentity(
      { email: 'ada@example.com', user_metadata: { full_name: 'Ada Lovelace', name: 'Ada', picture: 'https://example.com/p.png' } },
      { username: 'ada', displayName: 'Countess', avatarUrl: null },
    )).toEqual({
      name: 'ada',
      email: 'ada@example.com',
      avatarUrl: 'https://example.com/p.png',
    });
  });

  it('uses the Google picture and full name when the profile is empty', () => {
    expect(accountIdentity(
      { email: 'ada@example.com', user_metadata: { full_name: 'Ada Lovelace', avatar_url: 'https://example.com/a.png' } },
      null,
    )).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatarUrl: 'https://example.com/a.png',
    });
  });

  it('falls back when nobody is signed in', () => {
    expect(accountIdentity(null, null)).toEqual({ name: 'Signed in', email: '', avatarUrl: null });
  });
});
