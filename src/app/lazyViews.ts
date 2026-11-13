import { lazy } from 'react';

export const ScanView = lazy(() => import('../views/ScanView.tsx'));
export const LibraryList = lazy(() => import('../components/LibraryList.tsx'));
export const HomeFeed = lazy(() => import('../components/HomeFeed.tsx'));
export const RecommendationsView = lazy(() => import('../components/RecommendationsView.tsx'));
export const DataManagement = lazy(() => import('../components/DataManagement.tsx'));
export const ProfileSettings = lazy(() => import('../components/ProfileSettings.tsx'));
export const PasswordReset = lazy(() => import('../components/PasswordReset.tsx'));

export const preloadScanView = () => import('../views/ScanView.tsx');
export const preloadScanner = () => import('../components/Scanner.tsx');
export const preloadLibrary = () => import('../components/LibraryList.tsx');
export const preloadHome = () => import('../components/HomeFeed.tsx');
export const preloadData = () => import('../components/DataManagement.tsx');
export const preloadProfile = () => import('../components/ProfileSettings.tsx');
