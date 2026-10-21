import { beforeEach, describe, expect, it } from 'vitest';
import { getCloudLinkDecision, setCloudLinkDecision, shouldOfferLocalMerge } from '../cloudLink';

describe('cloudLink', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('offers a merge only for a fresh sign-in that already has books', () => {
    expect(shouldOfferLocalMerge({ localBookCount: 2, pendingCloudLink: true, decision: null })).toBe('offer');
    expect(shouldOfferLocalMerge({ localBookCount: 2, pendingCloudLink: false, decision: 'offer' })).toBe('offer');
    expect(shouldOfferLocalMerge({ localBookCount: 0, pendingCloudLink: true, decision: null })).toBe('sync');
    expect(shouldOfferLocalMerge({ localBookCount: 4, pendingCloudLink: true, decision: 'later' })).toBe('hold');
    expect(shouldOfferLocalMerge({ localBookCount: 4, pendingCloudLink: true, decision: 'merged' })).toBe('sync');
  });

  it('remembers the choice per account', () => {
    setCloudLinkDecision('user-a', 'later');
    setCloudLinkDecision('user-b', 'merged');
    expect(getCloudLinkDecision('user-a')).toBe('later');
    expect(getCloudLinkDecision('user-b')).toBe('merged');
    expect(getCloudLinkDecision('user-c')).toBeNull();
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('spine-scanner.cloud-link', '{');
    expect(getCloudLinkDecision('user-a')).toBeNull();
    localStorage.setItem('spine-scanner.cloud-link', JSON.stringify({ 'user-a': 'nope' }));
    expect(getCloudLinkDecision('user-a')).toBeNull();
  });
});
