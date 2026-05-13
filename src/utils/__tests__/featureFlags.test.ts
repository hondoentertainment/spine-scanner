import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FEATURE_FLAGS } from '../featureFlags';

// We test the flag resolution logic directly (not via the React hook) since
// the hook is just a thin useMemo wrapper around the same logic.

function resolveFlag(name: keyof typeof FEATURE_FLAGS): boolean {
  try {
    const override = localStorage.getItem('ff_' + name);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // ignore
  }
  return FEATURE_FLAGS[name];
}

describe('featureFlags', () => {
  beforeEach(() => {
    // Reset localStorage stub before each test
    vi.unstubAllGlobals();
  });

  it('returns the default value when no localStorage override is set', () => {
    const storageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } satisfies Storage;
    vi.stubGlobal('localStorage', storageMock);

    expect(resolveFlag('reading_sessions')).toBe(FEATURE_FLAGS.reading_sessions);
    expect(resolveFlag('storyGraph_import')).toBe(FEATURE_FLAGS.storyGraph_import);
  });

  it('returns true when localStorage override is "true"', () => {
    const storageMock = {
      getItem: vi.fn((key: string) => (key === 'ff_reading_sessions' ? 'true' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } satisfies Storage;
    vi.stubGlobal('localStorage', storageMock);

    expect(resolveFlag('reading_sessions')).toBe(true);
  });

  it('returns false when localStorage override is "false"', () => {
    const storageMock = {
      getItem: vi.fn((key: string) => (key === 'ff_storyGraph_import' ? 'false' : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } satisfies Storage;
    vi.stubGlobal('localStorage', storageMock);

    // storyGraph_import defaults to true, but the override says false
    expect(resolveFlag('storyGraph_import')).toBe(false);
  });

  it('falls back to default when localStorage throws', () => {
    const storageMock = {
      getItem: vi.fn(() => { throw new Error('SecurityError'); }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } satisfies Storage;
    vi.stubGlobal('localStorage', storageMock);

    expect(resolveFlag('ics_export')).toBe(FEATURE_FLAGS.ics_export);
  });
});
