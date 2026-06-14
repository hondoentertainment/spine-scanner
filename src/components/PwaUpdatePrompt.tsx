import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { applyPwaUpdate, dismissPwaRefresh, subscribePwaRefresh } from '../pwa/updateRegistration.ts';
import s from './PwaUpdatePrompt.module.css';

export default function PwaUpdatePrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => subscribePwaRefresh(setVisible), []);

  if (!visible) return null;

  return (
    <div className={`glass ${s.bar}`} role="alert" aria-live="polite" aria-label="App update available">
      <RefreshCw size={18} className={s.icon} aria-hidden />
      <div className={s.copy}>
        <strong className={s.title}>Update available</strong>
        <span className={s.sub}>Reload to get the latest SpineScanner improvements.</span>
      </div>
      <button type="button" className={s.primary} onClick={() => void applyPwaUpdate()}>
        Reload
      </button>
      <button type="button" className={s.ghost} onClick={dismissPwaRefresh}>
        Later
      </button>
    </div>
  );
}
