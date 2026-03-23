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

      {page === ‘privacy’ && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>Data collection</h3>
            <p>
              When you use the camera to scan barcodes or book spines, all image processing happens
              on your device. Camera frames are never uploaded or stored on a server. When you scan
              an ISBN, the app sends that ISBN to Google Books API and Open Library API to look up
              title, author, and cover information. Those services receive the ISBN and standard
              web request metadata (IP address, user agent).
            </p>
          </article>
          <article className={styles.card}>
            <h3>Local storage</h3>
            <p>
              Your book library, shelves, reading states, preferences, and notes are stored in
              IndexedDB and localStorage within your browser. This data stays on your device and is
              fully under your control. The app works offline by default and does not require an
              internet connection after the initial page load.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Analytics</h3>
            <p>
              The app tracks usage events like scan counts, success rates, and import/export
              activity. These analytics are stored locally in your browser only and are never
              transmitted to any external service. You can view your analytics summary and clear
              all analytics data at any time from the app’s data tools.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Cloud sync (optional)</h3>
            <p>
              Cloud sync is off by default. If the site operator has configured Supabase and you
              choose to create an account and sign in, your book data syncs to a hosted Supabase
              project so you can access your library across devices. Your data is protected by
              row-level security, meaning only your authenticated session can read or write your
              records. You can sign out at any time, and you can delete your account and all
              associated cloud data through the app’s account settings.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Error monitoring (optional)</h3>
            <p>
              Error reporting is only active when the site operator has configured a Sentry DSN.
              When enabled, Sentry collects crash reports and performance data to help diagnose
              issues. Personally identifiable information is stripped from breadcrumbs before
              events are sent — for example, ISBN values are removed from breadcrumb data.
              Performance transactions are sampled at 10%, so most page loads are not reported.
              If no Sentry DSN is configured, no monitoring code runs at all.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Third-party services</h3>
            <ul className={styles.list}>
              <li><strong>Google Books API</strong> — ISBN lookups for book metadata and cover images.</li>
              <li><strong>Open Library API</strong> — fallback ISBN lookups for book metadata.</li>
              <li><strong>Supabase</strong> (optional) — cloud sync and authentication when configured by the site operator.</li>
              <li><strong>Sentry</strong> (optional) — error and performance monitoring when configured by the site operator.</li>
            </ul>
          </article>
          <article className={styles.card}>
            <h3>Data retention</h3>
            <p>
              Local data persists in your browser until you delete it, clear your browser storage,
              or uninstall the app. Cloud data (if sync is enabled) is retained while your account
              is active and is removed when you delete your account. The site operator does not
              access your synced library data except as needed for infrastructure maintenance.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Your rights</h3>
            <ul className={styles.list}>
              <li><strong>Export</strong> — download your full library as JSON or CSV at any time from data tools.</li>
              <li><strong>Delete</strong> — clear local storage, delete your cloud account, or both.</li>
              <li><strong>Revoke camera access</strong> — remove camera permissions through your browser settings at any time.</li>
              <li><strong>Clear analytics</strong> — wipe all locally stored usage data with one action.</li>
            </ul>
          </article>
          <article className={styles.card}>
            <h3>Children</h3>
            <p>
              Spine Scanner is not directed at children under 13. We do not knowingly collect
              personal information from children. If you believe a child has provided data through
              the app, please contact us and we will remove it promptly.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Questions</h3>
            <SupportContact supportEmail={supportEmail} />
          </article>
        </div>
      )}

      {page === 'terms' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>No warranty</h3>
            <p>
              Spine Scanner is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied.
              We do not guarantee that the app will be error-free, uninterrupted, or that scan
              results will always be accurate. Book metadata depends on third-party APIs (Google
              Books, Open Library) whose accuracy and availability are outside our control.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Your responsibility for backups</h3>
            <p>
              You are responsible for maintaining backups of your library data. The app provides
              JSON and CSV export tools specifically so your catalog is portable. We strongly
              recommend exporting a backup before major imports, bulk deletes, device migrations,
              or clearing browser storage. Data stored only in your browser can be lost if you
              clear site data or switch devices without exporting first.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Acceptable use</h3>
            <p>
              Use the site for lawful, personal library tracking and household organization.
              You agree not to:
            </p>
            <ul className={styles.list}>
              <li>Use automated tools to scrape or flood the app or its connected APIs.</li>
              <li>Abuse sign-in or authentication systems (e.g., credential stuffing, fake accounts).</li>
              <li>Attempt to access other users' data or bypass row-level security.</li>
              <li>Use the app for any unlawful purpose or in violation of any applicable laws.</li>
            </ul>
          </article>
          <article className={styles.card}>
            <h3>Service modifications</h3>
            <p>
              We may update, change, or discontinue features at any time. The app is a small,
              evolving product and its functionality may shift as scanning technology, APIs, and
              infrastructure change. We will make reasonable efforts to preserve your ability to
              export your data before removing core features.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Third-party content</h3>
            <p>
              Book details, cover images, and metadata may come from Google Books API and Open
              Library API. Accuracy, availability, and licensing for that content are governed by
              those providers. We do not claim ownership of third-party metadata displayed in
              your library.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Limitation of liability</h3>
            <p>
              To the fullest extent permitted by law, the site operator is not liable for any
              indirect, incidental, or consequential damages arising from your use of the app.
              This includes, but is not limited to, data loss, interrupted access, inaccurate
              metadata, or issues caused by third-party services. Our total liability for any
              claim related to the app is limited to the amount you paid to use it (which, for
              free deployments, is zero).
            </p>
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
