import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type OcrProfile, BUILTIN_OCR_PROFILES } from '../types.ts';

/* ================================================================
 *  OCR Analytics entry (persisted rolling log)
 * ================================================================ */

export interface OcrAnalyticsEntry {
    timestamp: number;
    pass: string;
    confidence: number;
    imgWidth: number;
    brightness: number;
    blur: number;
}

const MAX_ANALYTICS_ENTRIES = 100;

/* ================================================================
 *  Store shape
 * ================================================================ */

interface PreferencesStore {
    /** User-created profiles appended to the built-in defaults. */
    customProfiles: OcrProfile[];
    /** ID of the currently active profile. Defaults to 'standard'. */
    activeProfileId: string;
    /** Rolling OCR analytics log (last 100 successful scans). */
    analyticsLog: OcrAnalyticsEntry[];

    /* ── Computed helpers (not persisted) ─────────────────────── */
    /** All profiles = built-ins + user-created. */
    allProfiles: () => OcrProfile[];
    /** The currently active profile object. */
    activeProfile: () => OcrProfile;

    /* ── Actions ──────────────────────────────────────────────── */
    setActiveProfileId: (id: string) => void;
    addProfile: (profile: Omit<OcrProfile, 'id' | 'isBuiltIn'>) => void;
    updateProfile: (id: string, updates: Partial<Omit<OcrProfile, 'id' | 'isBuiltIn'>>) => void;
    removeProfile: (id: string) => void;
    recordAnalytics: (entry: OcrAnalyticsEntry) => void;
    clearAnalytics: () => void;
}

/* ================================================================
 *  Store implementation
 * ================================================================ */

export const usePreferencesStore = create<PreferencesStore>()(
    persist(
        (set, get) => ({
            customProfiles: [],
            activeProfileId: 'standard',
            analyticsLog: [],

            allProfiles: () => [...BUILTIN_OCR_PROFILES, ...get().customProfiles],

            activeProfile: () => {
                const all = get().allProfiles();
                return all.find(p => p.id === get().activeProfileId)
                    ?? BUILTIN_OCR_PROFILES[0];
            },

            setActiveProfileId: (id) => set({ activeProfileId: id }),

            addProfile: (profile) => {
                const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                set(s => ({ customProfiles: [...s.customProfiles, { ...profile, id }] }));
            },

            updateProfile: (id, updates) => {
                set(s => ({
                    customProfiles: s.customProfiles.map(p =>
                        p.id === id ? { ...p, ...updates } : p
                    ),
                }));
            },

            removeProfile: (id) => {
                set(s => {
                    const next = s.customProfiles.filter(p => p.id !== id);
                    // Fall back to standard if the deleted profile was active
                    const activeId = s.activeProfileId === id ? 'standard' : s.activeProfileId;
                    return { customProfiles: next, activeProfileId: activeId };
                });
            },

            recordAnalytics: (entry) => {
                set(s => {
                    const log = [entry, ...s.analyticsLog].slice(0, MAX_ANALYTICS_ENTRIES);
                    return { analyticsLog: log };
                });
            },

            clearAnalytics: () => set({ analyticsLog: [] }),
        }),
        {
            name: 'spine-scanner-preferences',
            // Only persist state fields, not computed helpers
            partialize: (s) => ({
                customProfiles: s.customProfiles,
                activeProfileId: s.activeProfileId,
                analyticsLog: s.analyticsLog,
            }),
        }
    )
);
