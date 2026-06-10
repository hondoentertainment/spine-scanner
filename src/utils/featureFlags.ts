/**
 * Feature flags gate incomplete features. Set to true here or via
 * localStorage override: localStorage.setItem('ff_reading_sessions', 'true')
 */
export const FEATURE_FLAGS = {
  reading_sessions: false,   // Phase 27 — session timer UI
  sync_conflict_ui: false,   // Phase 30 — conflict resolution dialog
  household_sharing: false,  // Phase 29
  storyGraph_import: true,   // Phase 33 — shipped
  ics_export: true,          // Phase 33 — shipped
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;
