import { Suspense, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import RouteFallback from '../app/RouteFallback.tsx';
import { LibraryList } from '../app/lazyViews.ts';

export default function LibraryRoute({
  onStartScanning,
}: {
  onStartScanning: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isbn = searchParams.get('isbn');
  const series = searchParams.get('series');
  const onOpenComplete = useCallback(() => {
    if (!isbn) return;
    const next = new URLSearchParams(searchParams);
    next.delete('isbn');
    setSearchParams(next, { replace: true });
  }, [isbn, searchParams, setSearchParams]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <LibraryList
        onStartScanning={onStartScanning}
        initialOpenIsbn={isbn}
        onOpenComplete={onOpenComplete}
        initialSeriesFilter={series}
      />
    </Suspense>
  );
}
