import React from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import s from './PrivacyPolicy.module.css';

interface PrivacyPolicyProps {
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  return (
    <div
      className={s.overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-policy-title"
        className={`glass ${s.modal}`}
      >
        <button
          onClick={onClose}
          className={s.closeBtn}
          aria-label="Close privacy policy"
        >
          <X size={20} />
        </button>

        <h2 id="privacy-policy-title" className={s.title}>Privacy Policy</h2>
        <p className={s.updated}>Last updated: March 2026</p>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>What we collect</h3>
          <p className={s.body}>
            SpineScanner collects your email address when you create an account via Supabase
            authentication. If you enable cloud sync, your book library data is also stored —
            including book titles, authors, ISBNs, reading status, personal notes, and any
            custom shelves you create.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Where it's stored</h3>
          <p className={s.body}>
            By default, all your library data is saved locally in your browser's{' '}
            <code>localStorage</code> and never leaves your device. If you sign in and enable
            cloud sync, your data is additionally stored in a Supabase Postgres database hosted
            by Supabase Inc. in the United States, subject to{' '}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={s.link}
            >
              Supabase's privacy policy
            </a>
            .
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>What we don't collect</h3>
          <p className={s.body}>
            SpineScanner does not collect your browsing history, precise or approximate location,
            device identifiers, or any demographic information. We do not use third-party
            analytics services (no Google Analytics, Mixpanel, or similar). We do not sell or
            share your data with advertisers.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Error monitoring</h3>
          <p className={s.body}>
            If Sentry is configured for this deployment, anonymized error reports may be sent to
            Sentry, Inc. when the application encounters an unexpected error. These reports
            contain stack traces and browser environment details only. ISBNs and book metadata
            are explicitly stripped from all Sentry payloads before transmission.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Data retention</h3>
          <p className={s.body}>
            Local data persists in your browser until you clear your browser storage or
            uninstall the app. Cloud data is retained until you delete your account. Deleting
            your account permanently removes all associated library data from Supabase servers.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Your rights</h3>
          <p className={s.body}>
            You can export your complete library at any time as a JSON file from the Import &amp;
            Export screen — no account required. You can delete your account and all associated
            cloud data from the Profile settings screen. If you are in the EU or California, you
            may also have additional rights under GDPR or CCPA; please contact us to exercise them.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Contact</h3>
          <p className={s.body}>
            For questions, data requests, or privacy concerns, please open an issue on our{' '}
            <a
              href="https://github.com/AnEntrypoint/spine-scanner/issues"
              target="_blank"
              rel="noopener noreferrer"
              className={s.link}
            >
              GitHub issues page
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
