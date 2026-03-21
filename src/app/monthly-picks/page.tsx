'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, BookOpen, RefreshCw, Check, Loader2, Crown, Scroll } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import BottomNav from '@/components/BottomNav';
import { MONTHS, MAX_REGENERATIONS } from '@/lib/constants';
import type { Book, MonthlyPick } from '@/lib/types';

const OWL = '\u{1F989}';

type PickType = 'fresh' | 'reread' | 'wildcard';

interface PickCardData {
  type: PickType;
  label: string;
  icon: string;
  book: Book | null;
  bookId: string | null;
}

export default function MonthlyPicksPage() {
  const { user, isLoading: userLoading } = useUser();
  const [pick, setPick] = useState<MonthlyPick | null>(null);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVoting, setIsVoting] = useState<string | null>(null);
  const [isTiebreaking, setIsTiebreaking] = useState(false);
  const [tiebreakResult, setTiebreakResult] = useState<{ winnerId: string; reasoning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedCards, setRevealedCards] = useState<PickType[]>([]);

  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

  const isRevealed = (type: PickType) => revealedCards.indexOf(type) !== -1;

  // Fetch picks on mount
  const fetchPicks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/monthly-picks');
      if (!res.ok) throw new Error('Failed to fetch picks');
      const data = await res.json();
      setPick(data.pick);
      setBooks(data.books || {});
      // If picks exist, reveal all cards immediately
      if (data.pick) {
        setRevealedCards(['fresh', 'reread', 'wildcard']);
      }
    } catch (err) {
      console.error('Fetch picks error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPicks();
  }, [fetchPicks]);

  // Generate picks
  const handleGenerate = async (rejectedReason?: string) => {
    setIsGenerating(true);
    setError(null);
    setRevealedCards([]);
    try {
      const res = await fetch('/api/ai/monthly-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', rejectedReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed');
      }
      // Re-fetch to get the new picks with book details
      await fetchPicks();
      fetch('/api/sms/picks-ready', { method: 'POST' }).catch(() => {});
      // Stagger the card reveals
      setRevealedCards([]);
      setTimeout(() => setRevealedCards(['fresh']), 600);
      setTimeout(() => setRevealedCards(['fresh', 'reread']), 1200);
      setTimeout(() => setRevealedCards(['fresh', 'reread', 'wildcard']), 1800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Cast a vote
  const handleVote = async (bookId: string) => {
    if (!user || isVoting) return;
    setIsVoting(bookId);
    setError(null);
    try {
      const res = await fetch('/api/ai/monthly-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', userId: user.id, bookId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vote failed');

      if (data.agreed) {
        // Both agreed — re-fetch to show selected state
        await fetchPicks();
      } else if (data.needsTiebreak) {
        // Disagreement — trigger tiebreak automatically
        handleTiebreak();
      } else {
        // Vote recorded, waiting for partner
        await fetchPicks();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      setError(message);
    } finally {
      setIsVoting(null);
    }
  };

  // AI tiebreak
  const handleTiebreak = async () => {
    setIsTiebreaking(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/monthly-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tiebreak' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Tiebreak failed');
      setTiebreakResult({ winnerId: data.winnerId, reasoning: data.reasoning });
      await fetchPicks();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tiebreak failed';
      setError(message);
    } finally {
      setIsTiebreaking(false);
    }
  };

  // Determine user's vote and partner's vote
  const userName = user?.name || '';
  const myVote = userName === 'Greg' ? pick?.greg_vote : pick?.mati_vote;
  const partnerVote = userName === 'Greg' ? pick?.mati_vote : pick?.greg_vote;
  const partnerName = userName === 'Greg' ? 'Mati' : 'Greg';
  const bothVoted = !!(pick?.greg_vote && pick?.mati_vote);

  // Build pick cards
  const pickCards: PickCardData[] = pick ? [
    { type: 'fresh', label: 'The Fresh Pick', icon: '🆕', book: books[pick.fresh_pick || ''] || null, bookId: pick.fresh_pick },
    { type: 'reread', label: 'The Re-Read', icon: '🔁', book: books[pick.reread_pick || ''] || null, bookId: pick.reread_pick },
    { type: 'wildcard', label: 'The Wildcard', icon: '🎲', book: books[pick.wildcard_pick || ''] || null, bookId: pick.wildcard_pick },
  ] : [];

  if (userLoading || isLoading) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-pulse">{OWL}</div>
          <p className="font-body text-parchment/40 text-sm italic">Checking the owl&apos;s selections...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="candle-glow pt-2 text-center"
      >
        <h1 className="font-display text-gold text-xl text-glow tracking-wider">Monthly Picks</h1>
        <p className="font-body text-parchment/40 text-xs mt-1">{currentMonth} {currentYear}</p>
      </motion.header>

      {/* Error display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="castle-card p-3 border-crimson/40"
          >
            <p className="font-body text-crimson-light text-sm text-center">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No picks yet — generate button */}
      {!pick && !isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="castle-card p-8 text-center space-y-5"
        >
          <div className="text-5xl">{OWL}</div>
          <div className="space-y-2">
            <p className="font-display text-gold text-lg">The owl awaits your command</p>
            <p className="font-body text-parchment/50 text-sm">
              Owliver will analyze both your taste profiles and curate three book picks for {currentMonth}.
            </p>
          </div>
          <button
            onClick={() => handleGenerate()}
            className="btn-gold mx-auto flex items-center gap-2"
          >
            <Sparkles size={18} />
            Generate {currentMonth} Picks
          </button>
        </motion.div>
      )}

      {/* Generating spinner */}
      {isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="castle-card p-8 text-center space-y-5"
        >
          <div className="text-5xl animate-bounce">{OWL}</div>
          <div className="space-y-2">
            <p className="font-display text-gold text-lg">Owliver is deliberating...</p>
            <p className="font-body text-parchment/50 text-sm">
              Reading your profiles, cross-referencing your shelves, consulting the restricted section...
            </p>
          </div>
          <Loader2 size={24} className="text-gold animate-spin mx-auto" />
        </motion.div>
      )}

      {/* Pick cards */}
      {pick && !isGenerating && (
        <div className="space-y-4">
          {pickCards.map((card) => {
            const cardRevealed = isRevealed(card.type);
            const isMyVote = myVote === card.bookId;
            const isPartnerVote = partnerVote === card.bookId;
            const isSelected = pick.selected_book === card.bookId;
            const canVote = pick.status === 'voting' && !myVote && card.bookId;

            return (
              <motion.div
                key={card.type}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={cardRevealed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <div className={`castle-card overflow-hidden transition-all duration-500 ${
                  isSelected ? 'border-gold ring-1 ring-gold/30' : ''
                }`}>
                  {/* Card header */}
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{card.icon}</span>
                      <span className="font-display text-gold text-sm tracking-wide">{card.label}</span>
                    </div>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1 bg-gold/10 px-2 py-0.5 rounded-full"
                      >
                        <Crown size={12} className="text-gold" />
                        <span className="font-ui text-[10px] text-gold uppercase tracking-wider">Selected</span>
                      </motion.div>
                    )}
                  </div>

                  {/* Book content */}
                  {card.book ? (
                    <div className="px-4 pb-4">
                      <div className="flex gap-4">
                        <div className="w-20 h-[120px] rounded-lg overflow-hidden shadow-lg shadow-black/30 flex-shrink-0">
                          {card.book.cover_url ? (
                            <img
                              src={card.book.cover_url}
                              alt={card.book.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
                              <BookOpen size={24} className="text-parchment/20" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="font-display text-parchment text-base leading-tight">{card.book.title}</p>
                          <p className="font-body text-parchment/50 text-sm">{card.book.author}</p>
                          {card.book.genres && card.book.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {card.book.genres.slice(0, 3).map((g) => (
                                <span
                                  key={g}
                                  className="text-[9px] font-ui uppercase tracking-wider text-gold/60 bg-gold/5 px-1.5 py-0.5 rounded"
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          )}
                          {card.book.page_count && (
                            <p className="font-body text-parchment/30 text-xs">{card.book.page_count} pages</p>
                          )}
                        </div>
                      </div>

                      {/* Vote buttons and status */}
                      <div className="mt-4 flex items-center gap-2">
                        {canVote && (
                          <button
                            onClick={() => card.bookId && handleVote(card.bookId)}
                            disabled={!!isVoting}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border transition-all duration-300 active:scale-95 ${
                              isVoting === card.bookId
                                ? 'border-gold bg-gold/10 text-gold'
                                : 'border-castle-border hover:border-gold text-parchment/60 hover:text-gold'
                            }`}
                          >
                            {isVoting === card.bookId ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Check size={14} />
                            )}
                            <span className="font-display text-xs tracking-wide">Vote for this</span>
                          </button>
                        )}

                        {/* Show vote indicators */}
                        {isMyVote && (
                          <div className="flex items-center gap-1.5 bg-gold/10 px-3 py-1.5 rounded-full">
                            <Check size={12} className="text-gold" />
                            <span className="font-ui text-[10px] text-gold uppercase tracking-wider">Your pick</span>
                          </div>
                        )}
                        {isPartnerVote && (
                          <div className="flex items-center gap-1.5 bg-crimson/10 px-3 py-1.5 rounded-full">
                            <Check size={12} className="text-crimson-light" />
                            <span className="font-ui text-[10px] text-crimson-light uppercase tracking-wider">{partnerName}&apos;s pick</span>
                          </div>
                        )}

                        {/* Waiting for partner */}
                        {myVote && !partnerVote && !isMyVote && (
                          <p className="font-body text-parchment/30 text-xs italic">Waiting for {partnerName}...</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 pb-4">
                      <p className="font-body text-parchment/30 text-sm italic">Book details unavailable</p>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* AI Reasoning */}
      {pick?.ai_reasoning && !isGenerating && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2 }}
          className="castle-card p-4"
        >
          <div className="flex items-start gap-3">
            <div className="text-xl flex-shrink-0">{OWL}</div>
            <div className="flex-1">
              <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Owliver&apos;s Reasoning</p>
              <div className="font-body text-parchment/70 text-sm leading-relaxed space-y-2">
                {pick.ai_reasoning.split('\n\n').map((paragraph, i) => (
                  <p key={i}>{paragraph.replace(/\*\*/g, '')}</p>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Tiebreak section */}
      {pick && bothVoted && pick.greg_vote !== pick.mati_vote && pick.status === 'voting' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="castle-card p-6 text-center space-y-4"
        >
          <div className="text-3xl">{OWL}</div>
          <div className="space-y-1">
            <p className="font-display text-gold text-base">A disagreement in the tower!</p>
            <p className="font-body text-parchment/50 text-sm">
              Greg and Mati picked different books. Owliver will break the tie.
            </p>
          </div>
          <button
            onClick={handleTiebreak}
            disabled={isTiebreaking}
            className="btn-gold mx-auto flex items-center gap-2"
          >
            {isTiebreaking ? (
              <><Loader2 size={16} className="animate-spin" /> Deliberating...</>
            ) : (
              <><Scroll size={16} /> Let Owliver Decide</>
            )}
          </button>
        </motion.div>
      )}

      {/* Tiebreak result */}
      <AnimatePresence>
        {(tiebreakResult || pick?.ai_tiebreak_reasoning) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="castle-card p-4"
          >
            <div className="flex items-start gap-3">
              <div className="text-xl flex-shrink-0">{OWL}</div>
              <div className="flex-1">
                <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Tiebreak Ruling</p>
                <p className="font-body text-parchment/70 text-sm leading-relaxed">
                  {tiebreakResult?.reasoning || pick?.ai_tiebreak_reasoning}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected book celebration */}
      {pick?.status === 'selected' && pick.selected_book && books[pick.selected_book] && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="castle-card p-6 text-center space-y-3 border-gold/40"
        >
          <Crown size={28} className="text-gold mx-auto" />
          <p className="font-display text-gold text-lg">This Month&apos;s Read</p>
          <p className="font-display text-parchment text-base">{books[pick.selected_book].title}</p>
          <p className="font-body text-parchment/50 text-sm">{books[pick.selected_book].author}</p>
        </motion.div>
      )}

      {/* Regenerate button */}
      {pick && pick.status === 'voting' && !myVote && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="text-center"
        >
          <button
            onClick={() => handleGenerate('We want different options.')}
            disabled={isGenerating || pick.regeneration_count >= MAX_REGENERATIONS}
            className="btn-ghost text-sm flex items-center gap-2 mx-auto"
          >
            <RefreshCw size={14} />
            <span>
              {pick.regeneration_count >= MAX_REGENERATIONS
                ? 'No regenerations left'
                : `Regenerate picks (${MAX_REGENERATIONS - pick.regeneration_count} left)`
              }
            </span>
          </button>
        </motion.div>
      )}

      <BottomNav />
    </div>
  );
}