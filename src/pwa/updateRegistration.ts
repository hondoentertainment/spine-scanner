type RefreshListener = (needRefresh: boolean) => void;

const listeners = new Set<RefreshListener>();
let needRefresh = false;
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null;

export function subscribePwaRefresh(listener: RefreshListener): () => void {
  listeners.add(listener);
  listener(needRefresh);
  return () => listeners.delete(listener);
}

export function dismissPwaRefresh(): void {
  needRefresh = false;
  listeners.forEach((listener) => listener(false));
}

export async function applyPwaUpdate(): Promise<void> {
  if (updateServiceWorker) {
    await updateServiceWorker(true);
  }
}

export function initPwaUpdateRegistration(): void {
  if (!('serviceWorker' in navigator)) return;

  void import('virtual:pwa-register').then(({ registerSW }) => {
    updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefresh = true;
        listeners.forEach((listener) => listener(true));
      },
    });
  }).catch(() => {
    /* dev/test without built SW */
  });
}
