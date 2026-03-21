'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, BookOpen, CheckCircle } from 'lucide-react';
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

const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
  { value: 'read', label: 'Read it', icon: '\u2705' },
  { value: 'reading', label: 'Reading now', icon: '\uD83D\uDCD6' },
  { value: 'want_to_read', label: 'Want to read', icon: '\uD83D\uDD2E' },
  { value: 'would_reread', label: 'Would re-read', icon: '\uD83D\uDD01' },
];

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

export default function AddBookPage() {
  const { user } = useUser();
  const router = useRouter();

  const [selected, setSelected] = useState<SelectedBook | null>(null);
  const [status, setStatus] = useState<BookStatus>('read');
  const [rating, setRating] = useState<number>(0);
  const [hotTake, setHotTake] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

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

      // Show toast then reset form
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <BookSearch onSelect={setSelected} />
      </motion.div>

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="castle-card p-5 space-y-5"
          >
            {/* Book preview */}
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

            {/* Status selector */}
            <div>
              <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
                Status
              </p>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatus(opt.value)}
                    className={`p-3 rounded-lg border text-left transition-all duration-200 ${
                      status === opt.value
                        ? 'border-gold bg-gold/10 text-gold'
                        : 'border-castle-border text-parchment/50 active:border-castle-border-bright'
                    }`}
                  >
                    <span className="text-sm">
                      {opt.icon} {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Rating */}
            {(status === 'read' || status === 'would_reread') && (
              <div>
                <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
                  Rating
                </p>
                <RatingStars rating={rating} onRate={setRating} size={32} />
              </div>
            )}

            {/* Hot take */}
            {(status === 'read' || status === 'would_reread') && (
              <div>
                <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
                  Hot Take <span className="text-parchment/30 normal-case">(optional one-liner)</span>
                </p>
                <input
                  type="text"
                  value={hotTake}
                  onChange={(e) => setHotTake(e.target.value)}
                  placeholder="The ending wrecked me..."
                  className="input-castle"
                  maxLength={140}
                />
              </div>
            )}

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isSaving ? (
                <><div className="w-4 h-4 border-2 border-castle-bg/30 border-t-castle-bg rounded-full animate-spin" />Saving...</>
              ) : (
                <><Check size={18} />Add to My Shelf</>
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

      {!selected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center pt-8"
        >
          <div className="text-3xl mb-3">{OWL}</div>
          <p className="font-body text-parchment/30 text-sm">
            Search for a book above to get started.
            <br />
            Owliver will remember everything.
          </p>
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