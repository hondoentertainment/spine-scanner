import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Camera, Layers, Cloud, CheckCircle2 } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import s from './OnboardingModal.module.css';

interface OnboardingModalProps {
  onClose: () => void;
}

interface Step {
  title: string;
  body: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  {
    title: 'Welcome to Spine Scanner',
    body: 'Build your personal book library in seconds. Scan barcodes or spines to automatically capture titles, authors, and cover art — no typing required.',
    icon: <BookOpen size={48} color="#6366f1" strokeWidth={1.5} />,
  },
  {
    title: 'Scan Your Books',
    body: "Point your camera at a book's barcode or spine. Spine Scanner will automatically look up the title, author, and cover art.",
    icon: <Camera size={48} color="#6366f1" strokeWidth={1.5} />,
  },
  {
    title: 'Organize Your Library',
    body: 'Create shelves, track reading status, and use smart rules to automatically group your books.',
    icon: <Layers size={48} color="#6366f1" strokeWidth={1.5} />,
  },
  {
    title: 'Sync Across Devices',
    body: 'Create a free account to sync your library to the cloud and access it from any device. Or keep everything local — no account needed.',
    icon: <Cloud size={48} color="#6366f1" strokeWidth={1.5} />,
  },
  {
    title: "You're All Set!",
    body: 'Start by scanning your first book, or browse the library.',
    icon: <CheckCircle2 size={48} color="#6366f1" strokeWidth={1.5} />,
  },
];

const TITLE_ID = 'onboarding-modal-title';
const LAST_STEP = steps.length - 1;

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const trapRef = useFocusTrap<HTMLDivElement>();

  const goNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, LAST_STEP));
  }, []);

  const goBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        setCurrentStep((prev) => Math.min(prev + 1, LAST_STEP));
      } else if (e.key === 'ArrowLeft') {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isFirst = currentStep === 0;
  const isLast = currentStep === LAST_STEP;
  const current = steps[currentStep];

  return (
    <div
      className={s.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={trapRef}
        className={s.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        {/* Skip link */}
        <button
          type="button"
          className={s.skipBtn}
          onClick={onClose}
        >
          Skip
        </button>

        {/* Step content */}
        <div className={s.stepContent} key={currentStep}>
          <div className={s.iconWrap} aria-hidden="true">
            {current.icon}
          </div>

          <h2 id={TITLE_ID} className={s.title}>
            {current.title}
          </h2>

          <p className={s.body}>
            {current.body}
          </p>

          {/* Final step action buttons */}
          {isLast && (
            <div className={s.finalActions}>
              <button
                type="button"
                className={s.primaryBtn}
                onClick={onClose}
              >
                Start Scanning
              </button>
              <button
                type="button"
                className={s.secondaryBtn}
                onClick={onClose}
              >
                Explore Library
              </button>
            </div>
          )}
        </div>

        {/* Progress dots */}
        <div className={s.dots} role="tablist" aria-label="Onboarding steps">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === currentStep}
              aria-label={`Step ${i + 1} of ${steps.length}${i < currentStep ? ' (completed)' : i === currentStep ? ' (current)' : ''}`}
              className={`${s.dot} ${i < currentStep ? s.dotPast : ''} ${i === currentStep ? s.dotCurrent : ''}`}
              onClick={() => setCurrentStep(i)}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className={s.navRow}>
          <button
            type="button"
            className={s.backBtn}
            onClick={goBack}
            disabled={isFirst}
            aria-disabled={isFirst}
          >
            Back
          </button>

          {!isLast && (
            <button
              type="button"
              className={s.nextBtn}
              onClick={goNext}
            >
              Next
            </button>
          )}

          {isLast && (
            <button
              type="button"
              className={s.nextBtn}
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
