import { describe, it, expect, beforeEach } from 'vitest';
import { useAnalyticsStore } from '../useAnalyticsStore';
import { useProfileStore } from '../useProfileStore';
import { DEFAULT_PREFERENCES } from '../../types';

/**
 * Phase 34: analytics are now strictly opt-in. `track()` is a no-op until
 * `preferences.analyticsOptIn === true`. These tests verify the privacy gate.
 */
describe('useAnalyticsStore — opt-in gate', () => {
  beforeEach(() => {
    // Start every test from a clean events array and the default (opt-out) preference.
    useAnalyticsStore.setState({ events: [] });
    useProfileStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
  });

  it('track() is a no-op when analyticsOptIn is false', () => {
    expect(useProfileStore.getState().preferences.analyticsOptIn).toBe(false);

    useAnalyticsStore.getState().track('scan_barcode_success', { method: 'barcode' });
    useAnalyticsStore.getState().track('book_added');

    expect(useAnalyticsStore.getState().events).toHaveLength(0);
  });

  it('track() records when analyticsOptIn is true', () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, analyticsOptIn: true },
    });

    useAnalyticsStore.getState().track('scan_barcode_success', { method: 'barcode' });
    useAnalyticsStore.getState().track('book_added');

    const events = useAnalyticsStore.getState().events;
    expect(events).toHaveLength(2);
    // Events are prepended (newest first).
    expect(events[0].type).toBe('book_added');
    expect(events[1].type).toBe('scan_barcode_success');
    expect(events[1].meta).toEqual({ method: 'barcode' });
  });

  it('flipping the toggle back to false stops new events from being recorded', () => {
    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, analyticsOptIn: true },
    });
    useAnalyticsStore.getState().track('scan_barcode_success');
    expect(useAnalyticsStore.getState().events).toHaveLength(1);

    useProfileStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, analyticsOptIn: false },
    });
    useAnalyticsStore.getState().track('book_added');
    expect(useAnalyticsStore.getState().events).toHaveLength(1);
  });
});
