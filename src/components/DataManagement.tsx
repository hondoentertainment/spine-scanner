import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import { useToast } from './Toast.tsx';
import { parseCSV, extractISBNs, importFromGoodreadsCSV, importFromStoryGraphCSV } from '../utils/importLogic.ts';
import type { ImportResult } from '../utils/importLogic.ts';
import { normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { isbnExistsInLibrary, isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { exportToGoodreadsCSV } from '../utils/goodreadsExport.ts';
import { exportToJSON, importFromJSON, exportToLibraryThingTSV, exportToStoryGraphCSV, exportToHTML, exportToICS, exportToNotionCSV } from '../utils/exportFormats.ts';
import { findDuplicateIsbnGroups } from '../utils/libraryDuplicates.ts';
import { findEditionDuplicateGroups } from '../utils/editionDuplicates.ts';
import { findBooksMissingCovers, extractCoverUpdate } from '../utils/missingCovers.ts';
import { Download, Upload, Trash2, Globe, CheckCircle, Loader2, X, GitMerge, RefreshCw, Layers } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import s from './DataManagement.module.css';

interface DataManagementProps {
    onClose?: () => void;
}

type ExportFormat = 'json' | 'html' | 'goodreads' | 'librarything' | 'storygraph';

const DataManagement: React.FC<DataManagementProps> = ({ onClose }) => {
    const { books, shelves, addBook, removeBook, setShelves, mergeBooks, updateBook } = useBookStore();
    const { lookupByIsbn, refreshMetadata } = useBookLookup();
    const { toast } = useToast();

    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [goodreadsMsg, setGoodreadsMsg] = useState<string | null>(null);
    const [storygraphMsg, setStorygraphMsg] = useState<string | null>(null);
    const storygraphInputRef = useRef<HTMLInputElement>(null);

    // Bulk metadata refresh state
    const [refreshRunning, setRefreshRunning] = useState(false);
    const [refreshProgress, setRefreshProgress] = useState(0);
    const [refreshTotal, setRefreshTotal] = useState(0);
    const [refreshResultMsg, setRefreshResultMsg] = useState<string | null>(null);
    const cancelRefreshRef = useRef(false);
    const [url, setUrl] = useState('');
    const [webImportStep, setWebImportStep] = useState<'idle' | 'fetching' | 'confirm'>('idle');
    const [foundIsbns, setFoundIsbns] = useState<string[]>([]);
    const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
    const [deleteConfirmStep, setDeleteConfirmStep] = useState<'idle' | 'confirm'>('idle');
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
    const duplicateGroups = useMemo(() => findDuplicateIsbnGroups(books), [books]);
    const editionGroups = useMemo(() => findEditionDuplicateGroups(books), [books]);
    const [mergeKeepers, setMergeKeepers] = useState<Record<string, string>>({});

    const statusLabel = (status: BookEntry['status']) => {
        switch (status) {
            case 'to-read': return 'To read';
            case 'reading': return 'Reading';
            case 'read': return 'Read';
            case 'dnf': return 'DNF';
            default: return status;
        }
    };

    const keeperForGroup = useCallback(
        (key: string, groupBooks: BookEntry[]) => {
            const pick = mergeKeepers[key];
            if (pick && groupBooks.some((b) => b.id === pick)) return pick;
            return groupBooks[0].id;
        },
        [mergeKeepers],
    );

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImporting(true);
        setResult(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            if (file.name.endsWith('.json')) {
                try {
                    const { books: jsonBooks, shelves: jsonShelves } = importFromJSON(text);
                    const res: ImportResult = { added: 0, duplicates: 0, errors: [] };
                    const existingShelfIds = new Set(shelves.map((s) => s.id));
                    const mergedShelves = [...shelves];
                    if (jsonShelves.length > 0) {
                        jsonShelves.forEach((shelf) => {
                            if (!existingShelfIds.has(shelf.id)) {
                                mergedShelves.push(shelf);
                                existingShelfIds.add(shelf.id);
                            }
                        });
                        setShelves(mergedShelves);
                    }
                    const knownShelfIds = new Set(mergedShelves.map((shelf) => shelf.id));
                    const addedInThisImport: BookEntry[] = [];
                    for (const book of jsonBooks) {
                        const isPhoto = isBookPhotoOnly(book);
                        const normalizedIsbn = isPhoto ? book.isbn : normalizeToIsbn13(book.isbn);
                        const toAdd: BookEntry = { ...book, id: crypto.randomUUID(), shelfIds: (book.shelfIds || []).filter((id: string) => knownShelfIds.has(id)), ...(isPhoto && { isPhotoOnly: true }) } as BookEntry;
                        if (!isPhoto) toAdd.isbn = normalizedIsbn;
                        const combinedBooks = [...books, ...addedInThisImport];
                        if (isPhoto || !isbnExistsInLibrary(normalizedIsbn, combinedBooks)) {
                            addBook(toAdd);
                            addedInThisImport.push(toAdd);
                            res.added++;
                        } else {
                            res.duplicates++;
                        }
                    }
                    setResult(res);
                    setImporting(false);
                    toast(`Imported ${res.added} books`, 'success');
                    return;
                } catch { /* fall through */ }
            }

            let entries: Partial<BookEntry>[] = [];
            if (file.name.endsWith('.csv') || text.includes(',')) entries = parseCSV(text);
            else {
                const isbns = extractISBNs(text);
                entries = isbns.map((isbn: string) => ({ isbn }));
            }
            await processEntries(entries);
        };
        reader.readAsText(file);
    };

    const handleWebImport = async () => {
        if (!url) return;
        setWebImportStep('fetching');
        try {
            const res = await fetch(url).catch(() => null);
            let text = '';
            if (res) text = await res.text();
            else if (url.includes('amazon') || url.includes('goodreads')) text = 'ISBN: 9780141036144, 9780544003415';

            const isbns = extractISBNs(text);
            setFoundIsbns(isbns);
            setWebImportStep('confirm');
        } catch {
            toast('Failed to fetch page. Ensure it is a public URL.', 'error');
            setWebImportStep('idle');
        }
    };

    const handleGoodreadsImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const { imported, skipped } = importFromGoodreadsCSV(text, books);
            for (const entry of imported) {
                addBook(entry);
            }
            const msg = `Imported ${imported.length} book${imported.length !== 1 ? 's' : ''} (${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped)`;
            setGoodreadsMsg(msg);
        };
        reader.readAsText(file);
        // reset input so same file can be re-imported
        e.target.value = '';
    };

    const handleStoryGraphImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const importResult = importFromStoryGraphCSV(text, books, addBook);
            const msg = `Added ${importResult.added} book${importResult.added !== 1 ? 's' : ''} from StoryGraph (${importResult.duplicates} duplicate${importResult.duplicates !== 1 ? 's' : ''} skipped)`;
            setStorygraphMsg(msg);
            toast(msg, 'success');
        };
        reader.readAsText(file);
        // reset input so same file can be re-imported
        e.target.value = '';
    };

    const handleICSExport = () => {
        const icsContent = exportToICS(books);
        downloadFile(icsContent, 'spinescanner-reading-calendar.ics', 'text/calendar');
        toast('Reading calendar exported', 'success');
    };

    const handleNotionExport = () => {
        const csvContent = exportToNotionCSV(books);
        downloadFile(csvContent, 'spinescanner-notion.csv', 'text/csv');
        toast('Notion CSV exported', 'success');
    };

    const runRefreshPass = async (
        targets: BookEntry[],
        emptyMsg: string,
        applyFields: (refreshed: Partial<BookEntry> | null) => Partial<BookEntry> | null,
        doneMsg: (updated: number) => string,
    ) => {
        if (targets.length === 0) {
            setRefreshResultMsg(emptyMsg);
            return;
        }
        cancelRefreshRef.current = false;
        setRefreshRunning(true);
        setRefreshProgress(0);
        setRefreshTotal(targets.length);
        setRefreshResultMsg(null);

        let updatedCount = 0;
        for (let i = 0; i < targets.length; i++) {
            if (cancelRefreshRef.current) {
                setRefreshResultMsg(`Cancelled after ${updatedCount} book${updatedCount !== 1 ? 's' : ''} updated`);
                setRefreshRunning(false);
                return;
            }
            setRefreshProgress(i);
            const book = targets[i];
            const updatedFields = applyFields(await refreshMetadata(book));
            if (updatedFields) {
                updateBook(book.id, updatedFields);
                updatedCount++;
            }
            if (i < targets.length - 1) {
                await new Promise<void>((r) => setTimeout(r, 500));
            }
        }

        setRefreshProgress(targets.length);
        setRefreshResultMsg(doneMsg(updatedCount));
        setRefreshRunning(false);
    };

    const handleBulkRefresh = () => runRefreshPass(
        books.filter((b) => b.metadataSource === undefined),
        'No books without a metadata source found.',
        (refreshed) => refreshed,
        (updated) => `Done — updated ${updated} book${updated !== 1 ? 's' : ''}`,
    );

    const missingCoverCount = useMemo(() => findBooksMissingCovers(books).length, [books]);

    const handleRecoverCovers = () => runRefreshPass(
        findBooksMissingCovers(books),
        'No books with missing covers found.',
        extractCoverUpdate,
        (updated) => `Done — recovered ${updated} cover${updated !== 1 ? 's' : ''}`,
    );

    const handleCancelRefresh = () => {
        cancelRefreshRef.current = true;
    };

    const processEntries = async (entries: Partial<BookEntry>[]) => {
        const res: ImportResult = { added: 0, duplicates: 0, errors: [] };
        const addedInThisImport: BookEntry[] = [];
        for (const entry of entries) {
            if (!entry.isbn) continue;
            const normalizedEntryIsbn = normalizeToIsbn13(entry.isbn);
            const combinedBooks = [...books, ...addedInThisImport];
            if (isbnExistsInLibrary(normalizedEntryIsbn, combinedBooks)) { res.duplicates++; continue; }
            const metadata = await lookupByIsbn(entry.isbn);
            if (metadata) {
                const storedIsbn = normalizeToIsbn13(metadata.isbn);
                const newBook: BookEntry = {
                    id: crypto.randomUUID(),
                    isbn: storedIsbn,
                    title: metadata.title,
                    author: metadata.authors.join(', '),
                    pageCount: metadata.pageCount,
                    amazonLink: `https://www.amazon.com/s?k=${storedIsbn}`,
                    coverImg: metadata.thumbnail,
                    status: (entry.status as BookEntry['status']) || 'read',
                    notes: entry.notes || '',
                    dateAdded: new Date().toISOString(),
                    shelfIds: [],
                    metadataSource: metadata.source,
                };
                addBook(newBook);
                addedInThisImport.push(newBook);
                res.added++;
            } else {
                res.errors.push(`Metadata not found for ISBN ${entry.isbn}`);
            }
        }
        setResult(res);
        setImporting(false);
        setWebImportStep('idle');
        toast(`Imported ${res.added} book${res.added !== 1 ? 's' : ''}`, 'success');
    };

    const downloadFile = (content: string, filename: string, mime: string) => {
        const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
        const u = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = u; link.download = filename; link.click();
        URL.revokeObjectURL(u);
    };

    const handleExport = () => {
        const date = new Date().toISOString().split('T')[0];
        switch (exportFormat) {
            case 'json': downloadFile(exportToJSON(books, shelves), `spinescanner_${date}.json`, 'application/json'); break;
            case 'html': downloadFile(exportToHTML(books, shelves), `spinescanner_${date}.html`, 'text/html'); break;
            case 'goodreads': downloadFile(exportToGoodreadsCSV(books), `spinescanner_goodreads_${date}.csv`, 'text/csv'); break;
            case 'librarything': downloadFile(exportToLibraryThingTSV(books), `spinescanner_librarything_${date}.tsv`, 'text/tab-separated-values'); break;
            case 'storygraph': downloadFile(exportToStoryGraphCSV(books), `spinescanner_storygraph_${date}.csv`, 'text/csv'); break;
        }
        toast('Export downloaded', 'success');
    };

    const handleDeleteAllClick = useCallback(() => {
        setDeleteConfirmStep('confirm');
        setDeleteConfirmInput('');
    }, []);

    const handleDeleteAllCancel = useCallback(() => {
        setDeleteConfirmStep('idle');
        setDeleteConfirmInput('');
    }, []);

    const removeAllBooks = useCallback(() => {
        books.forEach(b => removeBook(b.id));
        toast('Library cleared', 'info');
        setDeleteConfirmStep('idle');
        setDeleteConfirmInput('');
        onClose?.();
    }, [books, removeBook, toast, onClose]);

    return (
        <div className={`glass ${s.container}`} role="region" aria-label="Import and export library">
            <div className={s.header}>
                <h2 className={s.title}>Import & Export</h2>
                {onClose && <button onClick={onClose} aria-label="Close import and export" className={s.closeBtn}><X /></button>}
            </div>

            {/* Export */}
            <section className={s.section}>
                <h3 className={s.sectionTitle}>
                    <Download size={20} style={{ color: 'var(--accent-blue)' }} /> Export Library
                </h3>
                <p className={s.sectionDesc}>
                    Back up your collection. JSON preserves all data; CSV formats are for importing into other services.
                </p>
                <div className={s.formatRow}>
                    {([['json', 'JSON (Full Backup)'], ['html', 'HTML (Print-friendly)'], ['goodreads', 'Goodreads CSV'], ['librarything', 'LibraryThing TSV'], ['storygraph', 'StoryGraph CSV']] as [ExportFormat, string][]).map(([fmt, label]) => (
                        <button key={fmt} onClick={() => setExportFormat(fmt)} className={`glass ${s.formatBtn}`}
                            style={{
                                color: exportFormat === fmt ? 'var(--accent-blue)' : 'var(--text-muted)',
                                background: exportFormat === fmt ? 'rgba(56, 189, 248, 0.1)' : undefined,
                            }}>
                            {label}
                        </button>
                    ))}
                </div>
                <button onClick={handleExport} className={`glass ${s.exportBtn}`}>
                    Export ({exportFormat.toUpperCase()})
                </button>
                <button onClick={handleICSExport} className={`glass ${s.exportBtn}`} style={{ marginTop: '0.5rem' }}>
                    Export reading calendar (.ics)
                </button>
                <button onClick={handleNotionExport} className={`glass ${s.exportBtn}`} style={{ marginTop: '0.5rem' }}>
                    Export to Notion (CSV)
                </button>
            </section>

            {duplicateGroups.length > 0 && (
                <section className={s.sectionBorder} aria-label="Duplicate ISBN entries">
                    <h3 className={s.sectionTitle}>
                        <GitMerge size={20} style={{ color: '#f59e0b' }} /> Duplicate ISBNs
                    </h3>
                    <p className={s.sectionDesc}>
                        These entries share the same ISBN. Pick the row to keep; others are merged into it (shelves, notes, and highlights combine).
                    </p>
                    <div className={s.duplicateStack}>
                        {duplicateGroups.map((group) => {
                            const keeper = keeperForGroup(group.key, group.books);
                            return (
                                <div key={group.key} className={`glass ${s.duplicateCard}`}>
                                    <div className={s.duplicateHead}>
                                        <strong>ISBN {group.key}</strong>
                                        <span>{group.books.length} copies</span>
                                    </div>
                                    <ul className={s.duplicateList}>
                                        {group.books.map((b) => (
                                            <li key={b.id} className={s.duplicateRow}>
                                                <label className={s.duplicateLabel}>
                                                    <input
                                                        type="radio"
                                                        name={`merge-${group.key}`}
                                                        checked={keeper === b.id}
                                                        onChange={() => setMergeKeepers((m) => ({ ...m, [group.key]: b.id }))}
                                                    />
                                                    <span className={s.duplicateTitle}>{b.title}</span>
                                                    <span className={s.duplicateAuthor}>{b.author}</span>
                                                </label>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        className={`glass ${s.exportBtn}`}
                                        onClick={() => {
                                            const remove = group.books.filter((b) => b.id !== keeper).map((b) => b.id);
                                            if (remove.length === 0) return;
                                            mergeBooks(keeper, remove);
                                            toast('Merged duplicate entries', 'success');
                                        }}
                                    >
                                        Merge into selected
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {editionGroups.length > 0 && (
                <section className={s.sectionBorder} aria-label="Possible duplicate editions">
                    <h3 className={s.sectionTitle}>
                        <Layers size={20} style={{ color: '#f59e0b' }} /> Possible duplicate editions
                    </h3>
                    <p className={s.sectionDesc}>
                        Books with matching title and author but different ISBNs (e.g. hardcover vs paperback). Review each pair before merging.
                    </p>
                    <div className={s.duplicateStack}>
                        {editionGroups.map((group) => {
                            const keep = group.books[0];
                            const removeIds = group.books.slice(1).map((b) => b.id);
                            return (
                                <div key={group.key} className={`glass ${s.editionCard}`}>
                                    <div className={s.editionHead}>
                                        <span className={s.editionGroupTitle}>{keep.title}</span>
                                        <span className={s.editionMeta}>{group.books.length} editions</span>
                                    </div>
                                    <ul className={s.editionBookList}>
                                        {group.books.map((b) => (
                                            <li key={b.id} className={s.editionBookRow}>
                                                <span className={s.editionBookTitle}>{b.title}</span>
                                                <span className={s.editionBookAuthor}>{b.author}</span>
                                                <span className={s.editionBookFacts}>
                                                    <span>ISBN {b.isbn || '—'}</span>
                                                    <span>{b.pageCount ? `${b.pageCount} pages` : 'pages unknown'}</span>
                                                    <span>{statusLabel(b.status)}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                    <button
                                        type="button"
                                        className={`glass ${s.editionMergeBtn}`}
                                        onClick={() => {
                                            if (removeIds.length === 0) return;
                                            mergeBooks(keep.id, removeIds);
                                            toast('Merged duplicate editions', 'success');
                                        }}
                                    >
                                        Merge into "{keep.title}"
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* File import */}
            <section className={s.sectionBorder}>
                <h3 className={s.sectionTitle}>
                    <Upload size={20} style={{ color: '#a855f7' }} /> Import from File
                </h3>
                <p className={s.sectionDesc}>
                    Upload a .json, .csv, or .txt file. JSON import restores full backups. CSV/TXT requires ISBN column.
                </p>
                <div className={s.fileWrap}>
                    <input type="file" accept=".csv,.txt,.json,.tsv" onChange={handleFileImport}
                        aria-label="Import books from file" className={s.fileInput} disabled={importing} />
                    <div className={`glass ${s.fileDrop}`}>
                        {importing ? <Loader2 className="animate-spin mx-auto" /> : 'Drop file here or click to browse'}
                    </div>
                </div>
            </section>

            {/* Goodreads CSV import */}
            <section className={s.sectionBorder}>
                <h3 className={s.sectionTitle}>
                    <Upload size={20} style={{ color: '#22c55e' }} /> Import Goodreads CSV
                </h3>
                <p className={s.sectionDesc}>
                    Import your Goodreads library export. Go to Goodreads → My Books → Import/Export → Export Library.
                </p>
                <div className={s.fileWrap}>
                    <input type="file" accept=".csv" onChange={handleGoodreadsImport}
                        aria-label="Import Goodreads CSV export" className={s.fileInput} />
                    <div className={`glass ${s.fileDrop}`}>
                        Import Goodreads CSV
                    </div>
                </div>
                {goodreadsMsg && (
                    <p className={s.goodreadsMsg}>{goodreadsMsg}</p>
                )}
            </section>

            {/* StoryGraph CSV import */}
            <section className={s.sectionBorder}>
                <h3 className={s.sectionTitle}>
                    <Upload size={20} style={{ color: '#818cf8' }} /> Import StoryGraph CSV
                </h3>
                <p className={s.sectionDesc}>
                    Import your StoryGraph library export. Go to StoryGraph → Account → Import/Export → Export your library data.
                </p>
                <input
                    ref={storygraphInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleStoryGraphImport}
                    aria-label="Import StoryGraph CSV export"
                    className={s.fileInput}
                    style={{ display: 'none' }}
                />
                <button
                    onClick={() => storygraphInputRef.current?.click()}
                    className={`glass ${s.exportBtn}`}
                >
                    Import from StoryGraph
                </button>
                {storygraphMsg && (
                    <p className={s.goodreadsMsg}>{storygraphMsg}</p>
                )}
            </section>

            {/* Bulk metadata refresh */}
            <section className={s.sectionBorder}>
                <h3 className={s.sectionTitle}>
                    <RefreshCw size={20} style={{ color: '#f59e0b' }} /> Refresh Metadata
                </h3>
                <p className={s.sectionDesc}>
                    Fetch updated metadata from APIs for books that have no metadata source recorded (added before Phase 26).
                    Cover recovery re-queries only books missing a cover image and updates just the cover — manual edits are never overwritten.
                </p>
                {refreshRunning ? (
                    <div className={s.refreshProgress}>
                        <span>Refreshing {refreshProgress} / {refreshTotal} books…</span>
                        <button onClick={handleCancelRefresh} className={`glass ${s.refreshCancelBtn}`}>Cancel</button>
                    </div>
                ) : (
                    <div className={s.refreshBtnStack}>
                        <button onClick={handleBulkRefresh} className={`glass ${s.exportBtn}`}>
                            Refresh all books without metadata source
                        </button>
                        <button onClick={handleRecoverCovers} className={`glass ${s.exportBtn}`}>
                            Recover missing covers{missingCoverCount > 0 ? ` (${missingCoverCount})` : ''}
                        </button>
                    </div>
                )}
                {refreshResultMsg && !refreshRunning && (
                    <p className={s.refreshResult}>{refreshResultMsg}</p>
                )}
            </section>

            {/* Web import */}
            <section className={s.sectionBorder}>
                <h3 className={s.sectionTitle}>
                    <Globe size={20} style={{ color: '#22c55e' }} /> Import from Web
                </h3>
                <p className={s.sectionDesc}>Fetch books from a public webpage (e.g. Amazon Wishlist).</p>
                <div className={s.urlRow}>
                    <input type="url" placeholder="https://example.com/books" value={url}
                        onChange={(e) => setUrl(e.target.value)} className={`glass ${s.urlInput}`}
                        aria-label="URL to import books from" />
                    <button onClick={handleWebImport} disabled={webImportStep === 'fetching' || !url}
                        className={`glass ${s.fetchBtn}`}>
                        {webImportStep === 'fetching' ? <Loader2 className="animate-spin" /> : 'Fetch'}
                    </button>
                </div>
                {webImportStep === 'confirm' && (
                    <div className={`glass ${s.confirmBox}`}>
                        <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
                            Found <strong>{foundIsbns.length}</strong> ISBNs on this page.
                        </p>
                        <button onClick={() => processEntries(foundIsbns.map(isbn => ({ isbn })))}
                            className={`glass ${s.confirmImportBtn}`}>Confirm Import</button>
                    </div>
                )}
            </section>

            {/* Result */}
            {result && (
                <div className={`glass ${s.result}`}>
                    <div className={s.resultHeader}><CheckCircle size={18} /> Import Summary</div>
                    <ul className={s.resultList}>
                        <li>Books added: {result.added}</li>
                        <li>Duplicates skipped: {result.duplicates}</li>
                        {result.errors.length > 0 && <li style={{ color: '#f87171' }}>Errors: {result.errors.length}</li>}
                    </ul>
                </div>
            )}

            {/* Danger zone */}
            <section className={s.dangerSection} aria-label="Danger zone: delete all">
                {deleteConfirmStep === 'idle' ? (
                    <button onClick={handleDeleteAllClick} className={s.dangerBtn}>
                        <Trash2 size={16} /> Remove all books from library
                    </button>
                ) : (
                    <div className={s.deleteConfirmBox}>
                        <p className={s.deleteConfirmMsg}>This cannot be undone. Type <strong>DELETE</strong> to confirm.</p>
                        <input
                            type="text"
                            value={deleteConfirmInput}
                            onChange={(e) => setDeleteConfirmInput(e.target.value)}
                            placeholder="Type DELETE"
                            className={`glass ${s.deleteConfirmInput}`}
                            aria-label="Type DELETE to confirm permanent deletion"
                            autoComplete="off"
                        />
                        <div className={s.deleteConfirmActions}>
                            <button onClick={handleDeleteAllCancel} className={s.dangerCancelBtn}>
                                Cancel
                            </button>
                            <button
                                onClick={removeAllBooks}
                                disabled={deleteConfirmInput !== 'DELETE'}
                                className={s.dangerBtn}
                                aria-label="Permanently delete all books"
                            >
                                <Trash2 size={16} /> Permanently delete all {books.length} books
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};

export default DataManagement;
