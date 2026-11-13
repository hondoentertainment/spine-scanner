import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PublicPage } from '../components/PublicInfoPage.tsx';
import { addBreadcrumb } from '../lib/errorMonitoring.ts';
import { PUBLIC_PAGE_META, type MainPath } from '../app/publicPages.ts';

export function useAppNavigation() {
  const navigate = useNavigate();
  const [srAnnouncement, setSrAnnouncement] = useState('');

  const openPublicPage = useCallback((page: PublicPage) => {
    navigate(`/${page}`);
    setSrAnnouncement(`${PUBLIC_PAGE_META[page].label} page`);
  }, [navigate]);

  const closePublicPage = useCallback(() => {
    navigate('/home');
    setSrAnnouncement('Returned to app');
  }, [navigate]);

  const goToMain = useCallback((path: MainPath, announcement: string) => {
    navigate(path);
    setSrAnnouncement(announcement);
    addBreadcrumb('navigation', 'Route changed', { path });
  }, [navigate]);

  return { srAnnouncement, setSrAnnouncement, openPublicPage, closePublicPage, goToMain };
}
