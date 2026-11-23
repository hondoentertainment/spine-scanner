import React from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CatalogImport from '../CatalogImport';
import { ToastProvider } from '../Toast';
import { useBookStore } from '../../store/useBookStore';
import type { BookEntry } from '../../types';

const lookupByIsbn = vi.fn();
vi.mock('../../hooks/useBookLookup', () => ({
  useBookLookup: () => ({ lookupByIsbn, refreshMetadata: vi.fn(), loading: false, error: null }),
}));

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../../import/__fixtures__');
const goodreadsFixture = readFileSync(join(fixtureDir, 'goodreads-tricky.csv'), 'utf8');

function renderImport() {
  return render(
    <ToastProvider>
      <CatalogImport />
    </ToastProvider>,
  );
}

async function chooseFile(contents: string, name: string, type = 'text/csv') {
  const input = screen.getByLabelText('Import from Goodreads or StoryGraph', { selector: 'input' });
  fireEvent.change(input, { target: { files: [new File([contents], name, { type })] } });
}

describe('CatalogImport', () => {
  beforeEach(() => {
    useBookStore.setState({ books: [], shelves: [] });
    lookupByIsbn.mockReset();
  });

  it('explains an empty file, a photo, and a spreadsheet that is not an export', async () => {
    renderImport();
    await chooseFile('', 'empty.csv');
    expect(await screen.findByRole('alert')).toHaveTextContent(/empty/i);

    await chooseFile('not a csv', 'shelf.png', 'image/png');
    expect(await screen.findByRole('alert')).toHaveTextContent(/CSV export/i);

    await chooseFile('Title,Author\nBook,Person', 'books.csv');
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a Goodreads or StoryGraph export/i);
  });

  it('previews new books, duplicates, and problem rows, then imports', async () => {
    useBookStore.setState({
      books: [{
        id: 'have',
        isbn: '',
        title: 'Parable of the Sower',
        author: 'Octavia E. Butler',
        pageCount: 1,
        amazonLink: '',
        coverImg: '',
        status: 'to-read',
        notes: '',
        dateAdded: '2020-01-01T00:00:00.000Z',
        shelfIds: [],
      } satisfies BookEntry],
      shelves: [],
    });
    renderImport();
    await chooseFile(goodreadsFixture, 'goodreads.csv');

    expect(await screen.findByText('Detected Goodreads export.')).toBeInTheDocument();
    expect(screen.getByText('New books').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Duplicates skipped').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Rows with problems').parentElement).toHaveTextContent('1');
    expect(screen.getByText(/Row 5: Missing a title/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import 3 books' }));
    expect((await screen.findAllByText(/Imported 3 books/)).length).toBeGreaterThan(0);
    const titles = useBookStore.getState().books.map((book) => book.title);
    expect(titles).toContain('Kindred, the novel');
    expect(titles).toContain('The Fifth Season');
    expect(titles.filter((title) => title === 'Parable of the Sower')).toHaveLength(1);
    expect(titles.filter((title) => title === 'Kindred, the novel')).toHaveLength(1);
  });

  it('can cancel a preview without writing books', async () => {
    renderImport();
    await chooseFile('Title,ISBN13,My Rating\nOnly Book,9780441478125,0\n', 'one.csv');
    expect(await screen.findByText('Detected Goodreads export.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Detected Goodreads export.')).not.toBeInTheDocument();
    expect(useBookStore.getState().books).toHaveLength(0);
  });

  it('looks up covers one book at a time when asked', async () => {
    lookupByIsbn.mockResolvedValue({
      title: 'Kindred, the novel',
      authors: ['Octavia E. Butler'],
      pageCount: 264,
      thumbnail: 'https://covers.example/kindred.jpg',
      isbn: '9780441478125',
      source: 'open_library',
    });
    renderImport();
    await chooseFile(goodreadsFixture, 'goodreads.csv');
    expect(await screen.findByText('Detected Goodreads export.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Look up missing covers after import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import 4 books' }));
    expect((await screen.findAllByText(/Imported 4 books/)).length).toBeGreaterThan(0);
    const kindred = useBookStore.getState().books.find((book) => book.isbn === '9780441478125');
    expect(kindred?.coverImg).toBe('https://covers.example/kindred.jpg');
    expect(lookupByIsbn).toHaveBeenCalled();
    const calls = lookupByIsbn.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(4);
  });
});
