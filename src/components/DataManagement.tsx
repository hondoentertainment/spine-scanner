import React, { useState, useCallback } from 'react';
import { useBookStore } from '../store/useBookStore.ts';
import { useBookLookup } from '../hooks/useBookLookup.ts';
import { useToast } from './Toast.tsx';
import { parseCSV, extractISBNs } from '../utils/importLogic.ts';
import type { ImportResult } from '../utils/importLogic.ts';
import { normalizeToIsbn13 } from '../utils/isbnValidation.ts';
import { isbnExistsInLibrary, isBookPhotoOnly } from '../utils/libraryUtils.ts';
import { exportToGoodreadsCSV } from '../utils/goodreadsExport.ts';
import { exportToJSON, importFromJSON, exportToLibraryThingTSV, exportToStoryGraphCSV } from '../utils/exportFormats.ts';
import { Download, Upload, Trash2, Globe, CheckCircle, Loader2, X } from 'lucide-react';
import type { BookEntry } from '../types.ts';
import s from './DataManagement.module.css';

interface DataManagementProps {
    onClose?: () => void;
}

type ExportFormat = 'json' | 'goodreads' | 'librarything' | 'storygraph';

const DataManagement: React.FC<DataManagementProps> = ({ onClose }) => {
    const { books, shelves, addBook, removeBook, setShelves } = useBookStore();
    const { lookupByIsbn } = useBookLookup();
    const { toast } = useToast();

    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [url, setUrl] = useState('');
    const [webImportStep, setWebImportStep] = useState<'idle' | 'fetching' | 'confirm'>('idle');
    const [foundIsbns, setFoundIsbns] = useState<string[]>([]);
    const [exportFormat, setExportFormat] = useState<ExportFormat>('json');
    const [deleteConfirmStep, setDeleteConfirmStep] = useState<'idle' | 'confirm'>('idle');
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');

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
                    {([['json', 'JSON (Full Backup)'], ['goodreads', 'Goodreads CSV'], ['librarything', 'LibraryThing TSV'], ['storygraph', 'StoryGraph CSV']] as [ExportFormat, string][]).map(([fmt, label]) => (
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
            </section>

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
