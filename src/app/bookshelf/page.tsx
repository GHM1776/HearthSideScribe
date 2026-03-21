'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useUser } from '@/hooks/useUser';
import { useBooks } from '@/hooks/useBooks';
import { createClient } from '@/lib/supabase/client';
import BookShelf from '@/components/BookShelf';
import BottomNav from '@/components/BottomNav';
import type { UserBook, Book } from '@/lib/types';

type ViewMode = 'mine' | 'partner' | 'both';

export default function BookshelfPage() {
  const { user } = useUser();
  const { reading, read, wantToRead, wouldReread, isLoading, getPartnerBooks } = useBooks(user?.id);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [partnerBooks, setPartnerBooks] = useState<(UserBook & { book: Book })[] | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [loadingPartner, setLoadingPartner] = useState(false);

  // Load partner name eagerly as soon as we have the current user
  useEffect(() => {
    if (!user) return;

    async function loadPartnerInfo() {
      const supabase = createClient();
      const { data } = await supabase
        .from('users')
        .select('id, name')
        .neq('id', user!.id)
        .single();

      if (data) {
        setPartnerName(data.name);
        setPartnerId(data.id);
      }
    }

    loadPartnerInfo();
  }, [user]);

  // Load partner books only when needed
  const loadPartnerBooks = async () => {
    if (!partnerId || partnerBooks !== null) return;
    setLoadingPartner(true);
    const books = await getPartnerBooks(partnerId);
    setPartnerBooks(books);
    setLoadingPartner(false);
  };

  const handleViewChange = async (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'partner' || mode === 'both') {
      await loadPartnerBooks();
    }
  };

  const partnerReading = partnerBooks?.filter((ub) => ub.status === 'reading') || [];
  const partnerRead = partnerBooks?.filter((ub) => ub.status === 'read') || [];
  const partnerWantToRead = partnerBooks?.filter((ub) => ub.status === 'want_to_read') || [];
  const partnerWouldReread = partnerBooks?.filter((ub) => ub.status === 'would_reread') || [];

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="candle-glow pt-2 text-center"
      >
        <h1 className="font-display text-gold text-xl text-glow tracking-wider">
          The Bookshelf
        </h1>
        <p className="font-body text-parchment/40 text-xs">
          Your complete library
        </p>
      </motion.header>

      {/* View toggle */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2"
      >
        {(['mine', 'partner', 'both'] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => handleViewChange(mode)}
            className={`flex-1 py-2 rounded-lg font-ui text-xs uppercase tracking-wider transition-all duration-200 ${
              viewMode === mode
                ? 'bg-gold/15 text-gold border border-gold/30'
                : 'text-parchment/40 border border-castle-border active:border-castle-border-bright'
            }`}
          >
            {mode === 'mine'
              ? (user?.name || 'Mine')
              : mode === 'partner'
              ? (partnerName || 'Partner')
              : 'Both'}
          </button>
        ))}
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="text-4xl animate-pulse">🦉</div>
        </div>
      ) : (
        <>
          {(viewMode === 'mine' || viewMode === 'both') && (
            <div>
              {viewMode === 'both' && (
                <h3 className="font-display text-gold/60 text-sm tracking-wider mb-3">
                  {user?.name}&apos;s Books
                </h3>
              )}
              <BookShelf
                reading={reading}
                read={read}
                wantToRead={wantToRead}
                wouldReread={wouldReread}
                userName={user?.name || 'You'}
              />
            </div>
          )}

          {(viewMode === 'partner' || viewMode === 'both') && (
            <div>
              {loadingPartner ? (
                <div className="flex justify-center py-8">
                  <div className="text-2xl animate-pulse">🦉</div>
                </div>
              ) : (
                <>
                  {viewMode === 'both' && (
                    <h3 className="font-display text-gold/60 text-sm tracking-wider mb-3 mt-6">
                      {partnerName}&apos;s Books
                    </h3>
                  )}
                  <BookShelf
                    reading={partnerReading}
                    read={partnerRead}
                    wantToRead={partnerWantToRead}
                    wouldReread={partnerWouldReread}
                    userName={partnerName || 'Partner'}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}

      <BottomNav />
    </div>
  );
}