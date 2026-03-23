import { useRegisterSW } from 'virtual:pwa-register/react';

interface ServiceWorkerUpdate {
  needsUpdate: boolean;
  updateApp: () => void;
  dismiss: () => void;
}

export function useServiceWorkerUpdate(): ServiceWorkerUpdate {
  const {
    needRefresh: [needsUpdate, setNeedsUpdate],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(() => {
          void registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  const updateApp = () => {
    void updateServiceWorker(true);
  };

  const dismiss = () => {
    setNeedsUpdate(false);
  };

  return { needsUpdate, updateApp, dismiss };
}
