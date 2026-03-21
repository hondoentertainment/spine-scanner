import { Download, Library, ScanLine, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  accent: string;
  icon: ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
}

export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'scan',
    title: 'Start with the fastest capture path',
    body: 'Use barcode scanning when you can, then fall back to spine OCR or manual ISBN entry when a cover is tricky.',
    accent: '#38bdf8',
    icon: <ScanLine size={20} />,
    ctaLabel: 'Open scanner',
  },
  {
    id: 'review',
    title: 'Keep momentum with a review inbox',
    body: 'Questionable scans, photo-only entries, and missing metadata can wait in one place instead of interrupting your session.',
    accent: '#f59e0b',
    icon: <Sparkles size={20} />,
    ctaLabel: 'See library',
  },
  {
    id: 'views',
    title: 'Save filters you will actually reuse',
    body: 'Turn current filters into saved views or smart shelves so your unread pile, short books, and cleanup queue stay one tap away.',
    accent: '#a855f7',
    icon: <Library size={20} />,
    ctaLabel: 'Try saved views',
  },
  {
    id: 'backup',
    title: 'Treat backups as part of the workflow',
    body: 'Export before major imports or bulk edits. The app is designed to keep your collection portable, not trapped.',
    accent: '#22c55e',
    icon: <Download size={20} />,
    ctaLabel: 'Open data tools',
  },
];
