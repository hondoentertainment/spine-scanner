import { ArrowRight, BookMarked, Download, Library, ScanLine, Sparkles } from 'lucide-react';
import styles from './OnboardingModal.module.css';

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  accent: string;
  icon: React.ReactNode;
  ctaLabel?: string;
  onCta?: () => void;
}

interface OnboardingModalProps {
  currentStep: number;
  steps: OnboardingStep[];
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
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

export default function OnboardingModal({
  currentStep,
  steps,
  onNext,
  onSkip,
  onComplete,
}: OnboardingModalProps) {
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  if (!step) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className={`glass ${styles.modal}`}>
        <div className={styles.progressRow}>
          <span className={styles.eyebrow}><BookMarked size={14} /> Quick tour</span>
          <span className={styles.progressText}>Step {currentStep + 1} of {steps.length}</span>
        </div>

        <div className={styles.progressBar} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${((currentStep + 1) / steps.length) * 100}%`, background: step.accent }} />
        </div>

        <div className={styles.hero} style={{ borderColor: `${step.accent}55` }}>
          <div className={styles.iconBadge} style={{ background: `${step.accent}20`, color: step.accent }}>
            {step.icon}
          </div>
          <div>
            <h2 id="onboarding-title" className={styles.title}>{step.title}</h2>
            <p className={styles.body}>{step.body}</p>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onSkip} className={styles.secondaryBtn}>Skip tour</button>
          <div className={styles.primaryGroup}>
            {step.onCta && step.ctaLabel && (
              <button type="button" onClick={step.onCta} className={styles.secondaryBtn}>
                {step.ctaLabel}
              </button>
            )}
            <button type="button" onClick={isLast ? onComplete : onNext} className={styles.primaryBtn}>
              {isLast ? 'Finish setup' : 'Next'}
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
