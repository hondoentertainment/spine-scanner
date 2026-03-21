import { useMemo, useState } from 'react';
import { BookOpen, Copy, Download, ExternalLink, LifeBuoy, Lock, ScrollText } from 'lucide-react';
import styles from './PublicInfoPage.module.css';
import type { SupportDiagnosticsSnapshot } from '../utils/supportDiagnostics.ts';
import { serializeSupportDiagnostics } from '../utils/supportDiagnostics.ts';

export type PublicPage = 'about' | 'privacy' | 'terms' | 'support';

interface PublicInfoPageProps {
  page: PublicPage;
  supportEmail?: string;
  diagnostics?: SupportDiagnosticsSnapshot | null;
  onClose: () => void;
}

type PageConfig = {
  eyebrow: string;
  title: string;
  intro: string;
  icon: typeof BookOpen;
};

const PAGE_CONFIG: Record<PublicPage, PageConfig> = {
  about: {
    eyebrow: 'About Spine Scanner',
    title: 'A faster way to catalog real books.',
    intro: 'Spine Scanner is designed for readers who want a practical library app first: quick capture, reliable edits, and ownership of their data.',
    icon: BookOpen,
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your library stays yours.',
    intro: 'The app works offline first and keeps cloud sync optional. You can browse, scan, export, and back up your library without creating an account.',
    icon: Lock,
  },
  terms: {
    eyebrow: 'Terms',
    title: 'Simple rules for using the site responsibly.',
    intro: 'These terms are intentionally lightweight. They focus on respectful use, third-party service limits, and the practical realities of a small web product.',
    icon: ScrollText,
  },
  support: {
    eyebrow: 'Support',
    title: 'Help for scanning, syncing, and exports.',
    intro: 'Most issues can be solved quickly by checking camera permissions, testing a barcode in good lighting, or exporting a local backup before larger changes.',
    icon: LifeBuoy,
  },
};

function SupportContact({ supportEmail }: { supportEmail?: string }) {
  if (!supportEmail) {
    return (
      <p className={styles.note}>
        This deployment does not have a public support email configured yet. Add `VITE_SUPPORT_EMAIL`
        before launch if you want a direct contact path in the site footer and support page.
      </p>
    );
  }

  return (
    <p className={styles.note}>
      Need more help? Email{' '}
      <a href={`mailto:${supportEmail}`} className={styles.inlineLink}>
        {supportEmail}
      </a>.
    </p>
  );
}

export default function PublicInfoPage({ page, supportEmail, diagnostics, onClose }: PublicInfoPageProps) {
  const config = PAGE_CONFIG[page];
  const Icon = config.icon;
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const diagnosticsText = useMemo(
    () => (diagnostics ? serializeSupportDiagnostics(diagnostics) : ''),
    [diagnostics]
  );

  const handleCopyDiagnostics = async () => {
    if (!diagnosticsText || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyStatus('Clipboard support is unavailable in this browser.');
      return;
    }

    try {
      await navigator.clipboard.writeText(diagnosticsText);
      setCopyStatus('Diagnostics copied. Paste this into a support request if needed.');
    } catch {
      setCopyStatus('Could not copy diagnostics automatically.');
    }
  };

  const handleDownloadDiagnostics = () => {
    if (!diagnosticsText || typeof document === 'undefined') return;

    const blob = new Blob([diagnosticsText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `spine-scanner-diagnostics-${diagnostics?.generatedAt?.slice(0, 10) ?? 'snapshot'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCopyStatus('Diagnostics downloaded.');
  };

  return (
    <section className={`glass ${styles.page}`} aria-labelledby="public-page-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <Icon size={14} /> {config.eyebrow}
          </span>
          <h2 id="public-page-title" className={styles.title}>{config.title}</h2>
          <p className={styles.intro}>{config.intro}</p>
        </div>
        <button type="button" onClick={onClose} className={styles.closeBtn}>
          Back to app
        </button>
      </div>

      {page === 'about' && (
        <div className={styles.grid}>
          <article className={styles.card}>
            <h3>What the site is for</h3>
            <p>Spine Scanner helps you add books by barcode, spine text, or manual ISBN entry, then organize them with shelves, reading states, notes, and exports.</p>
          </article>
          <article className={styles.card}>
            <h3>Who it is built for</h3>
            <p>Readers, collectors, families, and small clubs who want a lightweight catalog without committing to a heavy library system.</p>
          </article>
          <article className={styles.card}>
            <h3>What makes it public-ready</h3>
            <p>The app supports offline use, optional cloud sync, import and export flows, and recoverable backups so your collection is not locked into one device.</p>
          </article>
          <article className={styles.card}>
            <h3>What to expect</h3>
            <p>Barcode scans are usually the fastest path. OCR works best with clear, well-lit spine photos and may take longer on older devices.</p>
          </article>
        </div>
      )}

      {page === 'privacy' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>What data the app stores</h3>
            <p>Your library data, shelves, preferences, and local analytics summary are stored in your browser so the app can work offline.</p>
          </article>
          <article className={styles.card}>
            <h3>Camera and photos</h3>
            <p>Camera access is only used for scanning. Photo uploads stay in your browser unless you explicitly save a photo-only book or enable cloud sync.</p>
          </article>
          <article className={styles.card}>
            <h3>Optional cloud sync</h3>
            <p>If Supabase is configured and you sign in, your library data syncs to the connected Supabase project so you can use multiple devices.</p>
          </article>
          <article className={styles.card}>
            <h3>Third-party requests</h3>
            <p>ISBN lookups can call Google Books and Open Library. Those services may receive the ISBN you search for and standard web request metadata.</p>
          </article>
          <article className={styles.card}>
            <h3>Monitoring</h3>
            <p>Error reporting is optional and only active when the site operator configures it. This deployment strips ISBN breadcrumb data before sending Sentry events.</p>
          </article>
          <article className={styles.card}>
            <h3>Your controls</h3>
            <p>You can export your library, clear local analytics, sign out of sync, or remove local browser storage at any time from the app’s data tools.</p>
          </article>
        </div>
      )}

      {page === 'terms' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>Acceptable use</h3>
            <p>Use the site for lawful library tracking and personal or household organization. Do not abuse sign-in, scraping, or automated traffic limits.</p>
          </article>
          <article className={styles.card}>
            <h3>Third-party content</h3>
            <p>Book details and cover images may come from external APIs. Accuracy, availability, and licensing for that metadata are controlled by those providers.</p>
          </article>
          <article className={styles.card}>
            <h3>Service availability</h3>
            <p>The app is provided on an as-is basis. Features may change, and scan quality can vary based on device hardware, lighting, and upstream metadata services.</p>
          </article>
          <article className={styles.card}>
            <h3>Your backups matter</h3>
            <p>Before major imports, deletes, or migrations, export a backup. The product includes export tools specifically so your catalog is portable.</p>
          </article>
          <article className={styles.card}>
            <h3>Questions</h3>
            <SupportContact supportEmail={supportEmail} />
          </article>
        </div>
      )}

      {page === 'support' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>Scanning tips</h3>
            <ul className={styles.list}>
              <li>Prefer barcodes when available. They are faster and more reliable than OCR.</li>
              <li>Use bright, even light and hold the phone steady for a second before capture.</li>
              <li>Switch to photo upload for glossy covers, tiny spine text, or rotated books.</li>
            </ul>
          </article>
          <article className={styles.card}>
            <h3>Sync and account help</h3>
            <ul className={styles.list}>
              <li>If sync is unavailable, the app still saves locally and can retry later.</li>
              <li>Make sure the deployment has Supabase configured before expecting sign-in and password reset flows.</li>
              <li>When email confirmation is enabled, check spam and promotion folders after sign-up.</li>
            </ul>
          </article>
          <article className={styles.card}>
            <h3>Recommended recovery path</h3>
            <p>Export a JSON backup before major edits, imports, or device moves. If something looks wrong, restore from export before continuing to scan.</p>
          </article>
          <article className={styles.card}>
            <h3>Support contact</h3>
            <SupportContact supportEmail={supportEmail} />
          </article>
          {diagnostics && (
            <article className={styles.card}>
              <h3>Support diagnostics</h3>
              <p className={styles.note}>
                This snapshot helps debug sync, release, and configuration issues for this browser session.
              </p>
              <div className={styles.diagnosticsGrid}>
                <div>
                  <span className={styles.diagLabel}>Release</span>
                  <strong>{diagnostics.app.release}</strong>
                </div>
                <div>
                  <span className={styles.diagLabel}>Environment</span>
                  <strong>{diagnostics.app.environment}</strong>
                </div>
                <div>
                  <span className={styles.diagLabel}>Online</span>
                  <strong>{diagnostics.runtime.online ? 'Yes' : 'No'}</strong>
                </div>
                <div>
                  <span className={styles.diagLabel}>Pending sync</span>
                  <strong>{diagnostics.sync.pendingChanges}</strong>
                </div>
              </div>
              <div className={styles.diagnosticsActions}>
                <button type="button" className={styles.closeBtn} onClick={() => void handleCopyDiagnostics()}>
                  <Copy size={14} /> Copy diagnostics
                </button>
                <button type="button" className={styles.closeBtn} onClick={handleDownloadDiagnostics}>
                  <Download size={14} /> Download JSON
                </button>
              </div>
              {copyStatus && <p className={styles.note}>{copyStatus}</p>}
            </article>
          )}
          <article className={styles.card}>
            <h3>External services used by the app</h3>
            <p>
              Metadata may come from Google Books and Open Library. If those services are unavailable,
              scans can still be added manually and edited later.
            </p>
            <a href="https://openlibrary.org" target="_blank" rel="noreferrer" className={styles.inlineLink}>
              Open Library <ExternalLink size={14} />
            </a>
          </article>
        </div>
      )}
    </section>
  );
}
