'use client';

import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import RatingStars from './RatingStars';
import type { Book, BookStatus } from '@/lib/types';

interface BookCardProps {
  book: Book;
  userBookId?: string;
  status?: BookStatus;
  rating?: number | null;
  hotTake?: string | null;
  showRating?: boolean;
  compact?: boolean;
}

export default function BookCard({
  book,
  userBookId,
  status,
  rating,
  hotTake,
  showRating = true,
  compact = false,
}: BookCardProps) {
  const router = useRouter();

  if (compact) {
    return (
      <button
        onClick={() => router.push(`/book/${book.id}`)}
        className="flex-shrink-0 w-[100px] group"
      >
        <div className="relative w-[100px] h-[150px] rounded-lg overflow-hidden shadow-lg shadow-black/30 transition-transform duration-200 group-active:scale-95">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
              <BookOpen size={24} className="text-parchment/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
        </div>
        {showRating && rating && (
          <div className="mt-1.5 flex justify-center">
            <RatingStars rating={rating} size={12} interactive={false} />
          </div>
        )}
        <p className="font-body text-parchment/70 text-[11px] mt-1 text-center line-clamp-2 leading-tight">
          {book.title}
        </p>
      </button>
    );
  }

  return (
    <button
      onClick={() => router.push(`/book/${book.id}`)}
      className="castle-card-hover p-4 flex gap-4 items-start w-full text-left"
    >
      <div className="w-16 h-24 rounded-lg overflow-hidden shadow-lg shadow-black/30 flex-shrink-0">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
            <BookOpen size={24} className="text-parchment/20" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display text-parchment text-sm leading-tight">{book.title}</p>
        <p className="font-body text-parchment/50 text-xs mt-0.5">{book.author}</p>

        {showRating && rating && (
          <div className="mt-2">
            <RatingStars rating={rating} size={14} interactive={false} />
          </div>
        )}

        {hotTake && (
          <p className="font-body text-parchment/60 text-xs italic mt-1.5 line-clamp-2">
            &ldquo;{hotTake}&rdquo;
          </p>
        )}

        {book.genres && book.genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {book.genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="text-[9px] font-ui uppercase tracking-wider text-gold/60 bg-gold/5 px-1.5 py-0.5 rounded"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}