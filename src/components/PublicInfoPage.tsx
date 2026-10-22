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
    intro: 'Point at a barcode, a spine, or a shelf. You get a library you can edit, export, and keep. Your books stay in this browser unless you choose to sync them.',
    icon: BookOpen,
  },
  privacy: {
    eyebrow: 'Privacy',
    title: 'Your library stays yours.',
    intro: 'The app works offline first. An account is optional. Here is what is stored, what leaves the device, and how to delete it.',
    icon: Lock,
  },
  terms: {
    eyebrow: 'Terms',
    title: 'Simple rules for using the site responsibly.',
    intro: 'Use it to track your own books. Metadata comes from other services, and you can export a copy whenever you want.',
    icon: ScrollText,
  },
  support: {
    eyebrow: 'Support',
    title: 'Help for scanning, syncing, and exports.',
    intro: 'Start with the camera, the light, and a backup. Most scan and sync problems are fixed from this page.',
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

    try {
      const blob = new Blob([diagnosticsText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `spine-scanner-diagnostics-${diagnostics?.generatedAt?.slice(0, 10) ?? 'snapshot'}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCopyStatus('Diagnostics downloaded.');
    } catch {
      setCopyStatus('Could not download diagnostics in this browser.');
    }
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
            <h3>What you get</h3>
            <p>A library of the books you scan or import. Each book can have a cover, shelf, reading status, notes, and a place in the room.</p>
          </article>
          <article className={styles.card}>
            <h3>The steps</h3>
            <p>Point the camera at a barcode, a spine, or a row of books. Confirm the match. The book shows up in your library. Type an ISBN if the camera misses.</p>
          </article>
          <article className={styles.card}>
            <h3>What happens to your data</h3>
            <p>Your books stay in this browser. Export a file any time. Sign in only if you want the same library on another device. You can delete the local copy, and the cloud copy, from Profile.</p>
          </article>
          <article className={styles.card}>
            <h3>What to expect</h3>
            <p>A barcode is the fastest. A spine takes a moment and needs decent light. A shelf photo asks you to keep, edit, or skip each book before anything is saved.</p>
          </article>
        </div>
      )}

      {page === 'privacy' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>What data the app stores</h3>
            <p>Titles, authors, ISBNs, covers, shelves, notes, reading dates, and your settings stay in this browser so the app works offline.</p>
          </article>
          <article className={styles.card}>
            <h3>Camera and photos</h3>
            <p>The camera is only used while you scan. A photo stays on this device unless you save that book and turn on cloud sync.</p>
          </article>
          <article className={styles.card}>
            <h3>Optional cloud sync</h3>
            <p>Sign-in is optional. If this site has sync turned on and you sign in, your library is copied to that account so another device can open it.</p>
          </article>
          <article className={styles.card}>
            <h3>What leaves this device</h3>
            <p>Looking up a barcode sends that ISBN to Google Books or Open Library. Suggestions can send titles, authors, and subjects from your shelves to those same services. An extra suggestions service runs only if the site operator turns it on, and then it receives that same summary. We do not sell your library.</p>
          </article>
          <article className={styles.card}>
            <h3>Monitoring</h3>
            <p>Error reporting is optional and only active when the site operator configures it. This deployment strips ISBN breadcrumb data before sending Sentry events.</p>
          </article>
          <article className={styles.card}>
            <h3>Your controls</h3>
            <p>You can export your library, clear local analytics, sign out of sync, or remove local browser storage at any time from the app’s data tools.</p>
            <p>
              Anonymous usage analytics are off by default; you can turn them on from
              Profile → Privacy. The toggle only affects this device.
            </p>
            <p>
              You can delete all your data — local and cloud — at any time from
              Profile → Privacy. Deletion is permanent and cannot be undone.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Reading goals, series, and highlights</h3>
            <p>
              Optional yearly book and page targets, series labels, and saved quotes live only in your library data. They are included in JSON backups
              and in the optional “download my data” export from Profile when you choose to download it.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Duplicates and merging</h3>
            <p>
              If the same ISBN appears more than once, you can merge rows in Import &amp; export. That combines shelves, notes, and highlights into the
              entry you keep; other rows are removed from your library.
            </p>
          </article>
          <article className={styles.card}>
            <h3>Clearing data on your device</h3>
            <p>
              Profile includes a control to clear all local library data from this browser. That is separate from optional cloud sync and does not by itself delete a
              registered account on the server.
            </p>
          </article>
        </div>
      )}

      {page === 'terms' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>Acceptable use</h3>
            <p>Use the site to track books for yourself or your household. Do not hammer sign-in, scrape the site, or flood it with automated traffic.</p>
          </article>
          <article className={styles.card}>
            <h3>Third-party content</h3>
            <p>Covers and book details can come from Google Books and Open Library. Those services decide whether the data is available and accurate.</p>
          </article>
          <article className={styles.card}>
            <h3>Service availability</h3>
            <p>The app is provided as-is. Scans depend on your camera, the light, and those lookup services. Features can change.</p>
          </article>
          <article className={styles.card}>
            <h3>Your backups matter</h3>
            <p>Export a backup before a big import or delete. The export is your copy of the catalog.</p>
          </article>
          <article className={styles.card}>
            <h3>Account removal &amp; questions</h3>
            <p>
              Closing the site or clearing local storage does not automatically delete a signed-in account or cloud-stored data. Use the contact below if you need help
              removing an account after you have saved any exports you want to keep, or for other questions about these terms.
            </p>
            <SupportContact supportEmail={supportEmail} />
          </article>
        </div>
      )}

      {page === 'support' && (
        <div className={styles.stack}>
          <article className={styles.card}>
            <h3>Scanning tips</h3>
            <ul className={styles.list}>
              <li>Barcode: point at the bars on the back. That is the fastest path.</li>
              <li>Spine: point at the title, hold still, and use even light.</li>
              <li>Shelf: fill the frame with one row, then keep, edit, or skip each book.</li>
              <li>If the camera misses, type the ISBN or add a photo.</li>
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
                This snapshot helps debug sync and configuration for this browser session. Release and environment stay in Profile diagnostics.
              </p>
              <div className={styles.diagnosticsGrid}>
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
