'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Trash2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import RatingStars from '@/components/RatingStars';
import BottomNav from '@/components/BottomNav';
import type { Book, UserBook, BookStatus } from '@/lib/types';

const STATUS_OPTIONS: { value: BookStatus; label: string; icon: string }[] = [
  { value: 'read', label: 'Read', icon: '✅' },
  { value: 'reading', label: 'Reading', icon: '📖' },
  { value: 'want_to_read', label: 'Want to Read', icon: '🔮' },
  { value: 'would_reread', label: 'Would Re-Read', icon: '🔁' },
];

interface UserBookDisplay {
  userName: string;
  userId: string;
  userBook: UserBook | null;
  isCurrentUser: boolean;
}

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();

  const [book, setBook] = useState<Book | null>(null);
  const [userDisplays, setUserDisplays] = useState<UserBookDisplay[]>([]);
  const [myUserBook, setMyUserBook] = useState<UserBook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const bookId = params.id as string;

  useEffect(() => {
    if (!bookId || !user) return;

    async function fetchData() {
      const supabase = createClient();

      const { data: bookData } = await supabase
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

      if (bookData) setBook(bookData);

      const { data: allUsers } = await supabase.from('users').select('id, name');

      const { data: allUserBooks } = await supabase
        .from('user_books')
        .select('*')
        .eq('book_id', bookId);

      if (allUsers) {
        const displays: UserBookDisplay[] = allUsers.map((u) => ({
          userName: u.name,
          userId: u.id,
          userBook: allUserBooks?.find((ub) => ub.user_id === u.id) || null,
          isCurrentUser: u.id === user!.id,
        }));
        setUserDisplays(displays);
        setMyUserBook(displays.find((d) => d.isCurrentUser)?.userBook || null);
      }

      setIsLoading(false);
    }

    fetchData();
  }, [bookId, user]);

  const handleStatusChange = async (newStatus: BookStatus) => {
    if (!user || !book) return;
    setIsSaving(true);

    try {
      const res = await fetch('/api/user-books', {
        method: myUserBook ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          myUserBook
            ? { id: myUserBook.id, status: newStatus }
            : { user_id: user.id, book_id: book.id, status: newStatus }
        ),
      });
      const data = await res.json();
      const updated = data.userBook;

      setMyUserBook(updated);
      setUserDisplays((prev) =>
        prev.map((d) =>
          d.isCurrentUser ? { ...d, userBook: updated } : d
        )
      );
    } catch (error) {
      console.error('Status update error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRatingChange = async (newRating: number) => {
    if (!myUserBook) return;

    try {
      const res = await fetch('/api/user-books', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: myUserBook.id, rating: newRating || null }),
      });
      const data = await res.json();
      setMyUserBook(data.userBook);
      setUserDisplays((prev) =>
        prev.map((d) => (d.isCurrentUser ? { ...d, userBook: data.userBook } : d))
      );
    } catch (error) {
      console.error('Rating error:', error);
    }
  };

  const handleHotTakeChange = async (newHotTake: string) => {
    if (!myUserBook) return;

    try {
      await fetch('/api/user-books', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: myUserBook.id, hot_take: newHotTake || null }),
      });
    } catch (error) {
      console.error('Hot take error:', error);
    }
  };

  const handleRemove = async () => {
    if (!myUserBook) return;

    try {
      await fetch(`/api/user-books?id=${myUserBook.id}`, { method: 'DELETE' });
      setMyUserBook(null);
      setUserDisplays((prev) =>
        prev.map((d) => (d.isCurrentUser ? { ...d, userBook: null } : d))
      );
    } catch (error) {
      console.error('Remove error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-4xl animate-pulse">🦉</div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="page-container max-w-lg mx-auto text-center pt-20">
        <p className="font-display text-gold">Book not found</p>
        <button onClick={() => router.back()} className="btn-ghost mt-4 text-sm">
          Go back
        </button>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-parchment/40 hover:text-parchment/70 transition-colors font-ui text-sm"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Book hero */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center"
      >
        <div className="w-36 h-52 rounded-xl overflow-hidden shadow-2xl shadow-black/50">
          {book.cover_url ? (
            <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
              <BookOpen size={40} className="text-parchment/20" />
            </div>
          )}
        </div>

        <h1 className="font-display text-parchment text-xl mt-4 leading-tight">
          {book.title}
        </h1>
        <p className="font-body text-parchment/50 text-sm mt-1">
          {book.author}
          {book.publish_year ? ` \u00B7 ${book.publish_year}` : ''}
        </p>

        {book.genres && book.genres.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-2">
            {book.genres.map((g) => (
              <span
                key={g}
                className="text-[10px] font-ui uppercase tracking-wider text-gold/60 bg-gold/5 px-2 py-0.5 rounded-full"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </motion.div>

      {/* Both users' status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-3"
      >
        {userDisplays.map((display) => (
          <div key={display.userId} className="castle-card p-4">
            <div className="flex items-center justify-between">
              <span className={`font-display text-sm ${display.isCurrentUser ? 'text-gold' : 'text-parchment/70'}`}>
                {display.userName}
              </span>
              {display.userBook ? (
                <span className="font-body text-parchment/50 text-xs">
                  {STATUS_OPTIONS.find((s) => s.value === display.userBook?.status)?.icon}{' '}
                  {STATUS_OPTIONS.find((s) => s.value === display.userBook?.status)?.label}
                </span>
              ) : (
                <span className="font-body text-parchment/20 text-xs italic">Not on shelf</span>
              )}
            </div>
            {display.userBook?.rating && (
              <div className="mt-1.5">
                <RatingStars rating={display.userBook.rating} size={16} interactive={false} />
              </div>
            )}
            {display.userBook?.hot_take && (
              <p className="font-body text-parchment/50 text-xs italic mt-1">
                &ldquo;{display.userBook.hot_take}&rdquo;
              </p>
            )}
          </div>
        ))}
      </motion.div>

      {/* My controls */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="space-y-4"
      >
        <p className="font-display text-parchment/60 text-xs tracking-wider uppercase">
          Your Status
        </p>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              disabled={isSaving}
              className={`p-3 rounded-lg border text-left transition-all duration-200 text-sm ${
                myUserBook?.status === opt.value
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-castle-border text-parchment/50 active:border-castle-border-bright'
              }`}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        {myUserBook && (myUserBook.status === 'read' || myUserBook.status === 'would_reread') && (
          <div>
            <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
              Your Rating
            </p>
            <RatingStars rating={myUserBook.rating} onRate={handleRatingChange} size={32} />
          </div>
        )}

        {myUserBook && (myUserBook.status === 'read' || myUserBook.status === 'would_reread') && (
          <div>
            <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
              Hot Take
            </p>
            <input
              type="text"
              defaultValue={myUserBook.hot_take || ''}
              onBlur={(e) => handleHotTakeChange(e.target.value)}
              placeholder="One-liner review..."
              className="input-castle"
              maxLength={140}
            />
          </div>
        )}

        {myUserBook && (
          <button
            onClick={handleRemove}
            className="flex items-center justify-center gap-2 w-full py-2.5 text-crimson-light/60 hover:text-crimson-light text-xs font-ui transition-colors"
          >
            <Trash2 size={14} /> Remove from my shelf
          </button>
        )}
      </motion.div>

      {/* Synopsis */}
      {book.synopsis && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p className="font-display text-parchment/60 text-xs tracking-wider uppercase mb-2">
            Synopsis
          </p>
          <div className="castle-card p-4">
            <p className="font-body text-parchment/70 text-sm leading-relaxed">
              {book.synopsis}
            </p>
          </div>
        </motion.div>
      )}

      <BottomNav />
    </div>
  );
}