import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import s from './PwaInstallPrompt.module.css';

const DISMISS_KEY = 'spine-pwa-install-dismissed';

export default function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    setEvent(null);
  }, [event]);

  if (dismissed || !event) return null;

  return (
    <div className={`glass ${s.bar}`} role="region" aria-label="Install app">
      <Download size={18} className={s.icon} aria-hidden />
      <div className={s.copy}>
        <strong className={s.title}>Install SpineScanner</strong>
        <span className={s.sub}>Add to your home screen for quicker access.</span>
      </div>
      <button type="button" className={s.primary} onClick={() => void install()}>
        Install
      </button>
      <button type="button" className={s.ghost} onClick={dismiss}>
        Not now
      </button>
    </div>
  );
}
