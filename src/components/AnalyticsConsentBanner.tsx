import { useNavigate } from 'react-router-dom';
import { useConsentStore } from '../store/useConsentStore.ts';
import styles from './AnalyticsConsentBanner.module.css';

const PLAUSIBLE_DOMAIN = (import.meta.env.VITE_PLAUSIBLE_DOMAIN as string | undefined)?.trim();

export default function AnalyticsConsentBanner() {
  const navigate = useNavigate();
  const analyticsConsent = useConsentStore((s) => s.analyticsConsent);
  const setAnalyticsConsent = useConsentStore((s) => s.setAnalyticsConsent);

  if (!PLAUSIBLE_DOMAIN || analyticsConsent !== 'unknown') {
    return null;
  }

  return (
    <div className={styles.banner} role="region" aria-label="Analytics consent">
      <p className={styles.text}>
        We use privacy-friendly analytics to improve the app. No cookies are used for this. See our{' '}
        <button type="button" className={styles.linkLike} onClick={() => navigate('/privacy')}>
          Privacy
        </button>{' '}
        page for details.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.accept} onClick={() => setAnalyticsConsent('granted')}>
          Accept
        </button>
        <button type="button" className={styles.decline} onClick={() => setAnalyticsConsent('denied')}>
          Decline
        </button>
      </div>
    </div>
  );
}
