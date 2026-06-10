import { useMemo } from 'react';
import { FEATURE_FLAGS, type FeatureFlagName } from '../utils/featureFlags.ts';

/**
 * Returns the effective value of a feature flag.
 *
 * Priority:
 *   1. localStorage override: `ff_<name>` set to `'true'` or `'false'`
 *   2. Compile-time default from FEATURE_FLAGS
 *
 * Memoized — flags are not expected to change at runtime.
 */
export function useFeatureFlag(name: FeatureFlagName): boolean {
  return useMemo(() => {
    try {
      const override = localStorage.getItem('ff_' + name);
      if (override === 'true') return true;
      if (override === 'false') return false;
    } catch {
      // localStorage unavailable (e.g. private mode restrictions)
    }
    return FEATURE_FLAGS[name];
  }, [name]);
}
