import { BookOpen, Cloud, Library, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  accent: string;
  icon: ReactNode;
  /**
   * Optional CSS selector identifying the UI element this step describes.
   * Reserved for a future spotlight effect; currently informational only.
   */
  highlightSelector?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

/**
 * 4-step welcome tour shown on first app load.
 * Steps: Welcome -> Scan -> Organize -> Sync (optional).
 */
export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to SpineScanner',
    body: 'Scan book spines and barcodes to build your library — no typing required.',
    accent: '#38bdf8',
    icon: <BookOpen size={20} />,
  },
  {
    id: 'scan',
    title: 'Point your camera at a barcode',
    body: 'Or photograph the spine if no barcode. SpineScanner reads the ISBN and fetches title, author, and cover art for you.',
    accent: '#f59e0b',
    icon: <ScanLine size={20} />,
    highlightSelector: '[data-tour="scan-nav"]',
    ctaLabel: 'Open scanner',
  },
  {
    id: 'organize',
    title: 'Track your reading',
    body: 'Mark books as Reading, Read, or DNF. Add custom shelves. Track reading streaks and your Year in Books.',
    accent: '#a855f7',
    icon: <Library size={20} />,
    highlightSelector: '[data-tour="library-nav"]',
    ctaLabel: 'See library',
  },
  {
    id: 'sync',
    title: 'Sync across devices',
    body: "Sign in to back up your library to the cloud and sync across phones and laptops. Or stay fully offline — it's your call.",
    accent: '#22c55e',
    icon: <Cloud size={20} />,
    highlightSelector: '[data-tour="profile-nav"]',
  },
];
