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
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={focusTrapRef} className={`glass ${s.modal}`}>
        <button onClick={onClose} className={s.closeBtn} aria-label="Close privacy policy">
          <X size={20} />
        </button>

        <h2 id="privacy-policy-title" className={s.title}>Privacy Policy</h2>
        <p className={s.updated}>Last updated: March 2026</p>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>What we collect</h3>
          <p className={s.body}>
            SpineScanner collects only what is necessary to provide its core functionality. If you
            choose to create an account, we store your email address through Supabase authentication.
            If you enable cloud sync, your book library data — including titles, authors, ISBNs,
            reading status, personal notes, and shelf assignments — is stored in the cloud so it can
            be accessed across your devices.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Where it is stored</h3>
          <p className={s.body}>
            By default, all library data is saved locally in your browser's localStorage on your
            device and never leaves it. If you sign in and cloud sync is enabled, your data is
            additionally stored in a Postgres database managed by Supabase, Inc., hosted in the
            United States. Supabase's own privacy policy governs the handling of that data at rest.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>What we do not collect</h3>
          <p className={s.body}>
            SpineScanner does not collect browsing history, location data, device identifiers, or
            advertising identifiers. There are no third-party analytics scripts embedded in the
            application. We do not sell or share your data with advertisers or data brokers.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Error monitoring</h3>
          <p className={s.body}>
            If Sentry error monitoring is configured for your deployment, anonymized crash reports
            and error stack traces may be sent to Sentry, Inc. to help diagnose bugs. ISBNs and
            other book identifiers are explicitly stripped from all Sentry payloads before
            transmission, so your library contents are never included in error reports.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Data retention</h3>
          <p className={s.body}>
            Local data persists in your browser until you clear your browser storage or manually
            delete your library. Cloud data associated with your account persists until you delete
            your account. Deleting your account permanently removes all cloud-synced library data
            from Supabase.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Your rights and controls</h3>
          <p className={s.body}>
            You can export your full library at any time as a JSON file from the Import &amp; Export
            screen. This export contains all your book data in a portable, human-readable format.
            You can delete your account from the Profile settings screen, which removes your cloud
            data. You may also clear local data at any time by clearing your browser's site storage
            for this application.
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.sectionTitle}>Contact</h3>
          <p className={s.body}>
            If you have questions about this policy or how your data is handled, please open an
            issue on our{' '}
            <a
              href="https://github.com/search?q=spine-scanner&type=repositories"
              target="_blank"
              rel="noopener noreferrer"
              className={s.link}
            >
              GitHub repository
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
