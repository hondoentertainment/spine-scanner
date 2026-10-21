import { describe, expect, it } from 'vitest';
import { releaseFromBuildEnv, resolveAppRelease } from '../appRelease';

describe('appRelease', () => {
  it('prefers an explicit VITE_APP_RELEASE over the host commit', () => {
    expect(releaseFromBuildEnv({
      VITE_APP_RELEASE: '  release-42  ',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
      GITHUB_SHA: 'def456',
    })).toBe('release-42');
  });

  it('uses the Vercel commit when the release env var is missing', () => {
    expect(releaseFromBuildEnv({
      VITE_APP_RELEASE: '   ',
      VERCEL_GIT_COMMIT_SHA: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });

  it('falls back to GITHUB_SHA for CI builds', () => {
    expect(releaseFromBuildEnv({ GITHUB_SHA: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }))
      .toBe('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('does not invent dev-local for a production build with no release', () => {
    expect(resolveAppRelease(undefined, false)).toBe('');
    expect(resolveAppRelease('  ', false)).toBe('');
  });

  it('keeps dev-local for the local dev server only', () => {
    expect(resolveAppRelease(undefined, true)).toBe('dev-local');
    expect(resolveAppRelease('sha', true)).toBe('sha');
  });
});
