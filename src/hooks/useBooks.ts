'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { UserBook, Book, BookStatus } from '@/lib/types';

interface UserBookWithBook extends UserBook {
  book: Book;
}

export function useBooks(userId: string | undefined) {
  const [userBooks, setUserBooks] = useState<UserBookWithBook[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBooks = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);

    const supabase = createClient();
    const { data } = await supabase
      .from('user_books')
      .select('*, book:books(*)')
      .eq('user_id', userId)
      .order('date_added', { ascending: false });

    if (data) {
      setUserBooks(data as UserBookWithBook[]);
    }
    setIsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

  const byStatus = useCallback(
    (status: BookStatus) => userBooks.filter((ub) => ub.status === status),
    [userBooks]
  );

  const getPartnerBooks = useCallback(
    async (partnerId: string) => {
      const supabase = createClient();
      const { data } = await supabase
        .from('user_books')
        .select('*, book:books(*)')
        .eq('user_id', partnerId)
        .order('date_added', { ascending: false });

      return (data || []) as UserBookWithBook[];
    },
    []
  );

  return {
    userBooks,
    isLoading,
    refetch: fetchBooks,
    reading: byStatus('reading'),
    read: byStatus('read'),
    wantToRead: byStatus('want_to_read'),
    wouldReread: byStatus('would_reread'),
    getPartnerBooks,
  };
}