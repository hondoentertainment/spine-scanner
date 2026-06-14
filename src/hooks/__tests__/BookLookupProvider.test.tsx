import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookLookupProvider, useBookLookup } from '../useBookLookup';

function ReadLoading({ onReady }: { onReady: (loading: boolean) => void }) {
  const { loading } = useBookLookup();
  onReady(loading);
  return <span>{loading ? 'loading' : 'idle'}</span>;
}

function Probe() {
  const first = useBookLookup();
  const second = useBookLookup();
  return (
    <span>
      {first.loading || second.loading ? 'loading' : 'idle'}
    </span>
  );
}

describe('BookLookupProvider', () => {
  it('shares loading state across consumers', () => {
    const seen: boolean[] = [];
    render(
      <BookLookupProvider>
        <ReadLoading onReady={(loading) => seen.push(loading)} />
      </BookLookupProvider>,
    );
    expect(seen[0]).toBe(false);
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('exposes one shared lookup instance to nested hooks', () => {
    render(
      <BookLookupProvider>
        <Probe />
      </BookLookupProvider>,
    );
    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('throws when hook is used outside provider', () => {
    const Broken = () => {
      useBookLookup();
      return null;
    };
    expect(() => render(<Broken />)).toThrow(/BookLookupProvider/);
  });
});
