import { useState } from 'react';
import Scanner from './components/Scanner.tsx';
import LibraryList from './components/LibraryList.tsx';
import DataManagement from './components/DataManagement.tsx';
import { useBookLookup } from './hooks/useBookLookup.ts';
import { useBookStore } from './store/useBookStore.ts';
import type { BookEntry } from './types.ts';
import { BookOpen, Library, Scan, AlertCircle, CheckCircle, Database } from 'lucide-react';
import { generateAmazonLink } from './utils/amazonLink.ts';
import { isValidIsbn } from './utils/isbnValidation.ts';

function App() {
  const [view, setView] = useState<'scan' | 'library' | 'data'>('scan');
  const { lookupByIsbn, loading, error } = useBookLookup();
  const { addBook, books } = useBookStore();
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const handleScan = async (isbn: string) => {
    console.log(`[App] Received scan for ISBN: ${isbn}`);
    if (!isValidIsbn(isbn)) {
      console.log(`[App] Invalid ISBN checksum: ${isbn}`);
      alert('Invalid ISBN checksum. Please try again.');
      return;
    }

    if (books.find(b => b.isbn === isbn)) {
      console.log(`[App] ISBN ${isbn} already exists in library.`);
      alert('This book is already in your library!');
      return;
    }

    console.log(`[App] Looking up metadata for ${isbn}...`);

    try {
      const metadata = await lookupByIsbn(isbn);
      if (metadata) {
        console.log(`[App] Metadata found: ${metadata.title}`);
        const newBook: BookEntry = {
          id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
          isbn: metadata.isbn,
          title: metadata.title,
          author: metadata.authors.join(', '),
          pageCount: metadata.pageCount,
          amazonLink: generateAmazonLink(metadata.isbn),
          coverImg: metadata.thumbnail,
          status: 'to-read',
          notes: '',
          dateAdded: new Date().toISOString(),
        };
        addBook(newBook);
        setLastAdded(metadata.title);
        setTimeout(() => setLastAdded(null), 3000);
      } else {
        console.log(`[App] No metadata found or lookup failed for ${isbn}.`);
      }
    } catch (err) {
      console.error('[App] Error during scan handler:', err);
    }
  };

  return (
    <div className="app-container">
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '3rem',
        flexWrap: 'wrap',
        gap: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--primary), var(--accent-purple))',
            padding: '0.75rem',
            borderRadius: '1rem',
            boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.4)'
          }}>
            <BookOpen size={28} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.025em' }}>
              Spine<span style={{ color: 'var(--accent-blue)' }}>Scanner</span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Digital Library & OCR Explorer</p>
          </div>
        </div>

        <nav className="glass" style={{ display: 'flex', padding: '0.4rem', gap: '0.4rem' }}>
          <button
            onClick={() => setView('scan')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: view === 'scan' ? 'white' : 'var(--text-muted)',
              background: view === 'scan' ? 'rgba(255,255,255,0.1)' : 'transparent',
            }}
          >
            <Scan size={18} /> Scanner
          </button>
          <button
            onClick={() => setView('library')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: view === 'library' ? 'white' : 'var(--text-muted)',
              background: view === 'library' ? 'rgba(255,255,255,0.1)' : 'transparent',
            }}
          >
            <Library size={18} /> Library
          </button>
          <button
            onClick={() => setView('data')}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: view === 'data' ? 'white' : 'var(--text-muted)',
              background: view === 'data' ? 'rgba(255,255,255,0.1)' : 'transparent',
            }}
          >
            <Database size={18} /> Data
          </button>
        </nav>
      </header>

      <main>
        {view === 'scan' && (
          <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Scan Book Spine</h2>
              <p style={{ color: 'var(--text-muted)' }}>Position the ISBN barcode or text within the viewfinder.</p>
            </div>

            <Scanner onScan={handleScan} isScanning={loading} />

            {error && (
              <div className="glass" style={{
                marginTop: '1.5rem',
                padding: '1rem',
                color: '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                border: '1px solid rgba(248, 113, 113, 0.2)',
                background: 'rgba(248, 113, 113, 0.05)'
              }}>
                <AlertCircle size={20} />
                <span>{error}</span>
              </div>
            )}

            {lastAdded && (
              <div className="glass" style={{
                marginTop: '1.5rem',
                padding: '1rem',
                color: '#4ade80',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                border: '1px solid rgba(74, 222, 128, 0.2)',
                background: 'rgba(74, 222, 128, 0.05)',
                animation: 'slideUp 0.3s ease-out'
              }}>
                <CheckCircle size={20} />
                <span>Added "<strong>{lastAdded}</strong>" to library!</span>
              </div>
            )}
          </div>
        )}
        {view === 'library' && <LibraryList onManageData={() => setView('data')} />}
        {view === 'data' && <DataManagement onClose={() => setView('library')} />}
      </main>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .app-container { opacity: 0; animation: fadeIn 0.8s ease-out forwards; }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
