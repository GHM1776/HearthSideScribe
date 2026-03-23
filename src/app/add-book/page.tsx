'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, BookOpen, CheckCircle, Upload, Loader2, FileText } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import BookSearch from '@/components/BookSearch';
import RatingStars from '@/components/RatingStars';
import BottomNav from '@/components/BottomNav';
import type { BookStatus } from '@/lib/types';

const OWL = '\u{1F989}';

interface SelectedBook {
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
}

interface ToastData {
  title: string;
  author: string | null;
  cover_url: string | null;
}

interface ImportPreview {
  read: number;
  reading: number;
  wantToRead: number;
  total: number;
  rows: ParsedRow[];
}

interface ParsedRow {
  title: string;
  author: string;
  isbn?: string;
  rating?: number;
  shelf?: string;
}

const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
  { value: 'read', label: 'Read it', icon: '\u2705' },
  { value: 'reading', label: 'Reading now', icon: '\uD83D\uDCD6' },
  { value: 'want_to_read', label: 'Want to read', icon: '\uD83D\uDD2E' },
  { value: 'would_reread', label: 'Would re-read', icon: '\uD83D\uDD01' },
];

// ─── CSV Parser (no dependency needed) ───────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header row (handle quoted fields)
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, '').trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

function detectAndMapRows(rawRows: Record<string, string>[]): ParsedRow[] {
  return rawRows
    .map((row) => {
      // Goodreads format
      if ('title' in row && 'exclusive shelf' in row) {
        return {
          title: row['title'] || '',
          author: row['author'] || row['author l-f'] || '',
          isbn: (row['isbn13'] || row['isbn'] || '').replace(/[="]/g, ''),
          rating: parseInt(row['my rating'] || '0', 10) || undefined,
          shelf: row['exclusive shelf'] || 'read',
        };
      }

      // Kindle export format (title, author, asin)
      if ('title' in row && 'authors' in row) {
        return {
          title: row['title'] || '',
          author: row['authors'] || row['author'] || '',
          isbn: row['asin'] || '',
          rating: undefined,
          shelf: 'read',
        };
      }

      // Simple CSV (just title, author columns)
      if ('title' in row) {
        return {
          title: row['title'] || '',
          author: row['author'] || '',
          isbn: row['isbn'] || row['isbn13'] || '',
          rating: parseInt(row['rating'] || row['my rating'] || '0', 10) || undefined,
          shelf: row['shelf'] || row['status'] || 'read',
        };
      }

      return null;
    })
    .filter((r): r is ParsedRow => r !== null && r.title.trim().length > 0);
}

function getImportPreview(rows: ParsedRow[]): ImportPreview {
  let read = 0;
  let reading = 0;
  let wantToRead = 0;

  for (const row of rows) {
    const shelf = (row.shelf || 'read').toLowerCase().trim();
    if (shelf === 'currently-reading' || shelf === 'reading') reading++;
    else if (shelf === 'to-read' || shelf === 'want-to-read') wantToRead++;
    else read++;
  }

  return { read, reading, wantToRead, total: rows.length, rows };
}

// ─── Success Toast ───────────────────────────────────────────
function SuccessToast({ book, onDismiss }: { book: ToastData; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 60, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="castle-card border border-gold/30 bg-castle-surface p-4 flex items-center gap-3 shadow-2xl shadow-black/50">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt=""
            className="w-10 h-14 rounded object-cover flex-shrink-0 shadow-md"
          />
        ) : (
          <div className="w-10 h-14 rounded bg-castle-surface-light flex items-center justify-center flex-shrink-0">
            <BookOpen size={16} className="text-parchment/20" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <CheckCircle size={14} className="text-gold flex-shrink-0" />
            <span className="font-display text-gold text-xs tracking-wider uppercase">Added to shelf</span>
          </div>
          <p className="font-display text-parchment text-sm truncate">{book.title}</p>
          {book.author && (
            <p className="font-body text-parchment/50 text-xs truncate">{book.author}</p>
          )}
        </div>
        <div className="text-xl flex-shrink-0">{OWL}</div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AddBookPage() {
  const { user } = useUser();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single book add state
  const [selected, setSelected] = useState<SelectedBook | null>(null);
  const [status, setStatus] = useState<BookStatus>('read');
  const [rating, setRating] = useState<number>(0);
  const [hotTake, setHotTake] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  // Import state
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [importError, setImportError] = useState('');

  const showToast = (book: ToastData) => {
    setToast(book);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSave = async () => {
    if (!selected || !user) return;
    setIsSaving(true);

    try {
      const bookRes = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      });
      const bookData = await bookRes.json();
      const bookId = bookData.book.id;

      await fetch('/api/user-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          book_id: bookId,
          status,
          rating: status === 'read' || status === 'would_reread' ? rating || null : null,
          hot_take: (status === 'read' || status === 'would_reread') && hotTake ? hotTake : null,
        }),
      });

      showToast({
        title: selected.title,
        author: selected.author,
        cover_url: selected.cover_url,
      });

      setSelected(null);
      setStatus('read');
      setRating(0);
      setHotTake('');
    } catch (error) {
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Import handlers ────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError('');
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rawRows = parseCSV(text);

        if (rawRows.length === 0) {
          setImportError('Could not parse the CSV file. Make sure it has a header row with at least a "Title" column.');
          return;
        }

        const mappedRows = detectAndMapRows(rawRows);

        if (mappedRows.length === 0) {
          setImportError('No valid book entries found. Make sure the CSV has "Title" and "Author" columns.');
          return;
        }

        setImportPreview(getImportPreview(mappedRows));
      } catch {
        setImportError('Failed to read the file. Make sure it is a valid CSV.');
      }
    };
    reader.readAsText(file);

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!importPreview || !user) return;
    setIsImporting(true);
    setImportError('');

    try {
      const res = await fetch('/api/books/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import',
          userId: user.id,
          books: importPreview.rows,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setImportError(data.error || 'Import failed');
        return;
      }

      setImportResult(data);
      setImportPreview(null);

      // Fire-and-forget cover backfill
      fetch('/api/books/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'backfill-covers',
          userId: user.id,
        }),
      }).catch((err) => console.error('Cover backfill failed:', err));
    } catch {
      setImportError('Network error during import');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="candle-glow pt-2 text-center"
      >
        <h1 className="font-display text-gold text-xl text-glow tracking-wider">
          Add a Book
        </h1>
        <p className="font-body text-parchment/40 text-xs">
          Search and add to your library
        </p>
      </motion.header>

      {/* Book search */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <BookSearch onSelect={setSelected} />
      </motion.div>

      {/* Selected book form */}
      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="castle-card p-5 space-y-5"
          >
            <div className="flex gap-4">
              <div className="w-20 h-28 rounded-lg overflow-hidden shadow-lg shadow-black/30 flex-shrink-0">
                {selected.cover_url ? (
                  <img src={selected.cover_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
                    <BookOpen size={24} className="text-parchment/20" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-display text-parchment text-base leading-tight">
                  {selected.title}
                </p>
                <p className="font-body text-parchment/50 text-sm mt-1">
                  {selected.author || 'Unknown author'}
                </p>
                {selected.publish_year && (
                  <p className="font-body text-parchment/30 text-xs mt-0.5">
                    {selected.publish_year}
                    {selected.page_count ? ` \u00B7 ${selected.page_count} pages` : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Status picker */}
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatus(opt.value)}
                  className={`p-2.5 rounded-lg border text-sm font-ui transition-all ${
                    status === opt.value
                      ? 'border-gold bg-gold/10 text-gold'
                      : 'border-castle-border text-parchment/50 hover:border-parchment/30'
                  }`}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {/* Rating (for read/reread) */}
            {(status === 'read' || status === 'would_reread') && (
              <div className="space-y-2">
                <p className="font-display text-parchment/60 text-xs tracking-wider uppercase">
                  Rating
                </p>
                <RatingStars rating={rating} onChange={setRating} />
              </div>
            )}

            {/* Hot take */}
            {(status === 'read' || status === 'would_reread') && (
              <div className="space-y-2">
                <p className="font-display text-parchment/60 text-xs tracking-wider uppercase">
                  Hot Take (optional)
                </p>
                <input
                  type="text"
                  value={hotTake}
                  onChange={(e) => setHotTake(e.target.value)}
                  placeholder="One-liner review..."
                  maxLength={200}
                  className="input-castle"
                />
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-castle-bg/30 border-t-castle-bg rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Add to My Shelf
                </>
              )}
            </button>

            <button
              onClick={() => setSelected(null)}
              className="w-full text-parchment/30 text-xs font-body py-2"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state / Import section */}
      {!selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          <div className="text-center pt-4">
            <div className="text-3xl mb-3">{OWL}</div>
            <p className="font-body text-parchment/30 text-sm">
              Search for a book above to get started.
              <br />
              Owliver will remember everything.
            </p>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-castle-border" />
            <span className="font-ui text-parchment/20 text-xs uppercase tracking-wider">or</span>
            <div className="flex-1 border-t border-castle-border" />
          </div>

          {/* Import section */}
          <div className="castle-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Upload size={18} className="text-gold" />
              <div>
                <p className="font-display text-parchment text-sm">Import Your Library</p>
                <p className="font-body text-parchment/40 text-xs">
                  Upload a CSV from Goodreads or Kindle
                </p>
              </div>
            </div>

            {/* Import preview */}
            <AnimatePresence mode="wait">
              {importPreview ? (
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <div className="bg-castle-surface-light rounded-lg p-3 space-y-2">
                    <p className="font-display text-gold text-sm">
                      Found {importPreview.total} books
                    </p>
                    <div className="flex gap-4 text-xs font-body text-parchment/50">
                      <span>{importPreview.read} read</span>
                      {importPreview.reading > 0 && <span>{importPreview.reading} reading</span>}
                      {importPreview.wantToRead > 0 && <span>{importPreview.wantToRead} want to read</span>}
                    </div>
                    <p className="text-parchment/30 text-xs font-body">
                      5-star books will be marked as &ldquo;would re-read&rdquo;
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={isImporting}
                      className="btn-gold flex-1 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          Import {importPreview.total} Books
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setImportPreview(null)}
                      disabled={isImporting}
                      className="btn-ghost text-sm px-4"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              ) : importResult ? (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3"
                >
                  <div className="bg-gold/10 border border-gold/30 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-gold" />
                      <p className="font-display text-gold text-sm">Import Complete!</p>
                    </div>
                    <p className="font-body text-parchment/60 text-xs">
                      {importResult.imported} imported
                      {importResult.skipped > 0 && `, ${importResult.skipped} already on shelf`}
                      {importResult.errors > 0 && `, ${importResult.errors} skipped`}
                    </p>
                    <p className="font-body text-parchment/30 text-xs">
                      Cover art is loading in the background
                    </p>
                  </div>
                  <button
                    onClick={() => router.push('/bookshelf')}
                    className="btn-ghost w-full text-sm"
                  >
                    View Your Bookshelf
                  </button>
                </motion.div>
              ) : (
                <motion.div key="upload" className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-castle-border rounded-lg p-6 text-center hover:border-gold/30 transition-colors group"
                  >
                    <FileText size={24} className="text-parchment/20 mx-auto mb-2 group-hover:text-gold/40 transition-colors" />
                    <p className="font-body text-parchment/40 text-sm group-hover:text-parchment/60 transition-colors">
                      Choose a .csv file
                    </p>
                  </button>

                  <div className="text-xs font-body text-parchment/25 space-y-1">
                    <p>
                      <span className="text-parchment/40">Goodreads:</span> My Books &rarr; Import/Export &rarr; Export Library
                    </p>
                    <p>
                      <span className="text-parchment/40">Kindle:</span> Use the{' '}
                      <a
                        href="https://read.amazon.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gold/50 underline"
                      >
                        Kindle Cloud Reader
                      </a>{' '}
                      export or a CSV with Title and Author columns
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {importError && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-crimson-light text-xs font-body"
              >
                {importError}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}

      {/* Success Toast */}
      <AnimatePresence>
        {toast && <SuccessToast book={toast} onDismiss={() => setToast(null)} />}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}