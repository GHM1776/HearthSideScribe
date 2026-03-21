'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import BookCard from '@/components/BookCard';
import type { Book, UserBook } from '@/lib/types';

const COLLAPSED_MAX = 6; // 2 rows of 3

interface ShelfSectionProps {
  label: string;
  icon: string;
  books: (UserBook & { book: Book })[];
  delay?: number;
}

function ShelfSection({ label, icon, books, delay = 0 }: ShelfSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (books.length === 0) return null;

  const showToggle = books.length > COLLAPSED_MAX;
  const visibleBooks = expanded ? books : books.slice(0, COLLAPSED_MAX);

  return (
    <motion.section
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="section-heading">{icon} {label}</h2>
        <span className="text-parchment/30 font-ui text-xs">
          {books.length} {books.length === 1 ? 'book' : 'books'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {visibleBooks.map((ub) => (
          <BookCard
            key={ub.id}
            book={ub.book}
            userBookId={ub.id}
            status={ub.status}
            rating={ub.rating}
            hotTake={ub.hot_take}
            compact
          />
        ))}
      </div>

      {showToggle && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-4 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-castle-border text-parchment/40 hover:text-parchment/70 hover:border-castle-border-bright font-ui text-xs uppercase tracking-wider transition-all duration-200"
        >
          {expanded
            ? <><ChevronUp size={14} />Show less</>
            : <><ChevronDown size={14} />Show all {books.length} books</>
          }
        </button>
      )}
    </motion.section>
  );
}

interface BookShelfProps {
  reading: (UserBook & { book: Book })[];
  read: (UserBook & { book: Book })[];
  wantToRead: (UserBook & { book: Book })[];
  wouldReread: (UserBook & { book: Book })[];
  userName: string;
}

export default function BookShelf({
  reading = [],
  read = [],
  wantToRead = [],
  wouldReread = [],
  userName,
}: BookShelfProps) {
  const totalBooks = reading.length + read.length + wantToRead.length + wouldReread.length;

  if (totalBooks === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="castle-card p-8 text-center space-y-3"
      >
        <div className="text-4xl">📚</div>
        <p className="font-display text-gold text-base">
          {userName}&apos;s shelf is empty
        </p>
        <p className="font-body text-parchment/40 text-sm">
          Tap &ldquo;Add Book&rdquo; below to start building your library.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      <ShelfSection label="Currently Reading" icon="📖" books={reading} delay={0.1} />
      <ShelfSection label="Read" icon="✅" books={read} delay={0.2} />
      <ShelfSection label="Want to Read" icon="🔮" books={wantToRead} delay={0.3} />
      <ShelfSection label="Would Re-Read" icon="🔁" books={wouldReread} delay={0.4} />
    </div>
  );
}