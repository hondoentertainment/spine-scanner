import styles from '../components/App.module.css';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { SUPPORT_EMAIL } from './publicPages.ts';

const LEGAL_LINKS = [
  ['about', 'About'],
  ['privacy', 'Privacy'],
  ['terms', 'Terms'],
  ['support', 'Support'],
] as const;

export default function LegalFooter({
  onOpen,
}: {
  onOpen: (page: PublicPage) => void;
}) {
  return (
    <footer className={styles.legalFooter}>
      <nav className={styles.legalLinks} aria-label="About SpineScanner">
        {LEGAL_LINKS.map(([page, label], index) => (
          <span key={page} className={styles.legalItem}>
            {index > 0 && <span className={styles.legalDot} aria-hidden="true">·</span>}
            <button type="button" className={styles.legalLink} onClick={() => onOpen(page)}>
              {label}
            </button>
          </span>
        ))}
        {SUPPORT_EMAIL && (
          <span className={styles.legalItem}>
            <span className={styles.legalDot} aria-hidden="true">·</span>
            <a className={styles.legalLink} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </span>
        )}
      </nav>
    </footer>
  );
}
