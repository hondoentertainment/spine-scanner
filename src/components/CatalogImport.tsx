import React, { useRef, useState } from 'react';
import type { CatalogPreview } from '../import/catalogCsv.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import { useBookStore } from '../store/useBookStore.ts';
import type { BookEntry } from '../types.ts';
import { pluralize } from '../utils/plural.ts';
import { useToast } from './Toast.tsx';
import s from './CatalogImport.module.css';

const WRONG_FILE = 'Choose a CSV export. Photos, PDFs, and Excel workbooks are not Goodreads or StoryGraph libraries.';
const READ_ERROR = 'That file could not be read. Export the CSV again and retry.';
const PROBLEM_PREVIEW_LIMIT = 8;

type Phase =
  | { kind: 'idle' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'error'; message: string }
  | { kind: 'preview'; preview: CatalogPreview }
  | { kind: 'importing'; done: number; total: number }
  | { kind: 'covers'; done: number; total: number }
  | { kind: 'done'; imported: number; duplicates: number; problems: number; stopped: boolean };

function isWrongFile(file: File): boolean {
  if (file.type.startsWith('image/') || file.type === 'application/pdf') return true;
  return /\.(png|jpe?g|gif|webp|pdf|xlsx?|docx?)$/i.test(file.name);
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('read'));
    reader.readAsText(file);
  });
}

const CatalogImport: React.FC = () => {
  const setBooks = useBookStore((state) => state.setBooks);
  const updateBook = useBookStore((state) => state.updateBook);
  const { lookupByIsbn } = useBookLookup();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [enrich, setEnrich] = useState(false);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const cancelRef = useRef(false);
  const requestRef = useRef(0);

  const reset = () => {
    cancelRef.current = true;
    requestRef.current += 1;
    setPreview(null);
    setPhase({ kind: 'idle' });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    cancelRef.current = true;
    const request = requestRef.current + 1;
    requestRef.current = request;

    if (file.size === 0) {
      setPreview(null);
      setPhase({ kind: 'error', message: 'This file is empty. Choose a Goodreads or StoryGraph CSV export.' });
      return;
    }
    if (isWrongFile(file)) {
      setPreview(null);
      setPhase({ kind: 'error', message: WRONG_FILE });
      return;
    }

    setPreview(null);
    setPhase({ kind: 'reading', done: 0, total: 0 });
    let text: string;
    try {
      text = await readFile(file);
    } catch {
      if (requestRef.current !== request) return;
      setPhase({ kind: 'error', message: READ_ERROR });
      return;
    }
    if (requestRef.current !== request) return;

    const { previewCatalogCsvAsync } = await import('../import/catalogCsv.ts');
    if (requestRef.current !== request) return;
    const result = await previewCatalogCsvAsync(text, useBookStore.getState().books, (done, total) => {
      if (requestRef.current !== request) return;
      setPhase({ kind: 'reading', done, total });
    });
    if (requestRef.current !== request) return;
    if (!result.ok) {
      setPhase({ kind: 'error', message: result.error });
      return;
    }
    setPreview(result.preview);
    setPhase({ kind: 'preview', preview: result.preview });
  };

  const lookupCovers = async (books: BookEntry[]) => {
    const targets = books.filter((book) => book.isbn && !book.coverImg);
    if (targets.length === 0) return;
    for (let index = 0; index < targets.length; index += 1) {
      if (cancelRef.current) return;
      setPhase({ kind: 'covers', done: index, total: targets.length });
      try {
        const metadata = await lookupByIsbn(targets[index].isbn);
        if (metadata?.thumbnail) updateBook(targets[index].id, { coverImg: metadata.thumbnail });
      } catch {
        // One lookup failure should not discard the books already saved.
      }
    }
    if (!cancelRef.current) setPhase({ kind: 'covers', done: targets.length, total: targets.length });
  };

  const onImport = async () => {
    if (!preview || preview.toImport.length === 0) return;
    cancelRef.current = false;
    const snapshot = preview;
    setPhase({ kind: 'importing', done: 0, total: snapshot.toImport.length });
    const { importBooksInBatches } = await import('../import/catalogCsv.ts');
    const written = await importBooksInBatches(
      snapshot.toImport,
      (batch) => {
        const current = useBookStore.getState().books;
        setBooks([...batch, ...current]);
      },
      (done, total) => setPhase({ kind: 'importing', done, total }),
      () => cancelRef.current,
    );
    const stopped = written < snapshot.toImport.length;
    if (enrich && written > 0 && !stopped) {
      await lookupCovers(snapshot.toImport.slice(0, written));
    }
    setPhase({
      kind: 'done',
      imported: written,
      duplicates: snapshot.duplicateCount,
      problems: snapshot.problems.length,
      stopped,
    });
    const summary = stopped
      ? `Stopped after ${pluralize(written, 'book')}`
      : `Imported ${pluralize(written, 'book')}`;
    toast(summary, stopped ? 'info' : 'success');
  };

  const busy = phase.kind === 'reading' || phase.kind === 'importing' || phase.kind === 'covers';
  const problemRows = phase.kind === 'preview' ? phase.preview.problems.slice(0, PROBLEM_PREVIEW_LIMIT) : [];
  const hiddenProblems = phase.kind === 'preview' ? phase.preview.problems.length - problemRows.length : 0;

  return (
    <div className={s.wrap}>
      <h3 id="catalog-import-title" className={s.title}>
        Import from Goodreads or StoryGraph
      </h3>
      <p id="catalog-import-help" className={s.help}>
        Upload the CSV export. The column names tell us whether it came from Goodreads or StoryGraph.
        The file stays in this browser.
      </p>
      <ol className={s.steps}>
        <li>On Goodreads: My Books, then Import/Export, then Export Library.</li>
        <li>On StoryGraph: Account, then Import/Export, then Export your library.</li>
        <li>Choose that CSV here. Review the counts, then import.</li>
      </ol>

      <label className={s.fileWrap}>
        <input
          type="file"
          accept=".csv,text/csv,.txt"
          aria-label={busy ? 'Working through the file' : 'Import from Goodreads or StoryGraph'}
          aria-describedby="catalog-import-help"
          className={s.fileInput}
          onChange={onFile}
          disabled={busy}
        />
        <span className={s.fileDrop}>
          {busy ? 'Working through the file' : 'Import from Goodreads or StoryGraph'}
        </span>
      </label>

      {phase.kind === 'error' && (
        <p className={s.error} role="alert">{phase.message}</p>
      )}

      {phase.kind === 'reading' && (
        <p className={s.status} role="status">
          {phase.total > 0
            ? `Reading ${phase.done.toLocaleString()} of ${phase.total.toLocaleString()} rows`
            : 'Reading the file…'}
        </p>
      )}

      {phase.kind === 'preview' && (
        <div className={s.preview} aria-live="polite">
          <p className={s.detected}>Detected {phase.preview.formatLabel} export.</p>
          <dl className={s.counts}>
            <div>
              <dt>New books</dt>
              <dd>{phase.preview.toImport.length.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Duplicates skipped</dt>
              <dd>{phase.preview.duplicateCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Rows with problems</dt>
              <dd>{phase.preview.problems.length.toLocaleString()}</dd>
            </div>
          </dl>
          {phase.preview.totalRows === 0 && (
            <p className={s.help}>No book rows were found under the header.</p>
          )}
          {phase.preview.missingIsbnCount > 0 && (
            <p className={s.help}>
              {pluralize(phase.preview.missingIsbnCount, 'new book')} {phase.preview.missingIsbnCount === 1 ? 'has' : 'have'} no ISBN.
              {phase.preview.missingIsbnCount === 1 ? ' It is' : ' They are'} still imported, matched later by title and author.
            </p>
          )}
          {phase.preview.toImport.length > 0 && (
            <ul className={s.samples}>
              {phase.preview.toImport.slice(0, 5).map((book) => (
                <li key={book.id}>{book.title} — {book.author}</li>
              ))}
            </ul>
          )}
          {problemRows.length > 0 && (
            <ul className={s.problems}>
              {problemRows.map((problem) => (
                <li key={`${problem.row}-${problem.message}`}>Row {problem.row}: {problem.message}</li>
              ))}
              {hiddenProblems > 0 && <li>And {hiddenProblems.toLocaleString()} more.</li>}
            </ul>
          )}
          <label className={s.check}>
            <input
              type="checkbox"
              checked={enrich}
              onChange={(event) => setEnrich(event.target.checked)}
            />
            Look up missing covers after import
          </label>
          <p className={s.help}>Optional. Uses Open Library and Google Books, one book at a time.</p>
          <div className={s.actions}>
            <button
              type="button"
              className={s.primary}
              onClick={onImport}
              disabled={phase.preview.toImport.length === 0}
            >
              Import {pluralize(phase.preview.toImport.length, 'book')}
            </button>
            <button type="button" className={s.secondary} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(phase.kind === 'importing' || phase.kind === 'covers') && (
        <div className={s.progressBlock}>
          <label className={s.progressLabel} htmlFor="catalog-import-progress">
            {phase.kind === 'covers'
              ? `Looking up covers, ${phase.done.toLocaleString()} of ${phase.total.toLocaleString()}`
              : `Importing ${phase.done.toLocaleString()} of ${phase.total.toLocaleString()}`}
          </label>
          <progress
            id="catalog-import-progress"
            className={s.progress}
            max={Math.max(phase.total, 1)}
            value={phase.done}
          />
          <button type="button" className={s.secondary} onClick={() => { cancelRef.current = true; }}>
            {phase.kind === 'covers' ? 'Stop cover lookup' : 'Stop import'}
          </button>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className={s.done} role="status">
          <p>
            {phase.stopped ? 'Stopped after' : 'Imported'} {pluralize(phase.imported, 'book')}.
            {' '}{pluralize(phase.duplicates, 'duplicate')} skipped.
            {phase.problems > 0 ? ` ${pluralize(phase.problems, 'row')} had problems.` : ''}
          </p>
          <button type="button" className={s.secondary} onClick={reset}>
            Import another file
          </button>
        </div>
      )}
    </div>
  );
};

export default CatalogImport;
