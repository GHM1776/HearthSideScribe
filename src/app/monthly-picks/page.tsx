'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, BookOpen, RefreshCw, Loader2, Crown, Scroll, PartyPopper, X } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import BottomNav from '@/components/BottomNav';
import { MONTHS, MAX_REGENERATIONS } from '@/lib/constants';
import type { Book, MonthlyPick } from '@/lib/types';
import { PICK_COLUMNS } from '@/lib/types';

const OWL = '\u{1F989}';

const RANK_BADGES = [
  { label: '1st', color: 'bg-gold text-castle-bg', points: 3 },
  { label: '2nd', color: 'bg-gold/60 text-castle-bg', points: 2 },
  { label: '3rd', color: 'bg-gold/30 text-parchment', points: 1 },
];

function getPickIds(pick: MonthlyPick): (string | null)[] {
  return [pick.fresh_pick, pick.reread_pick, pick.wildcard_pick, pick.pick_4, pick.pick_5];
}

function getPickLabel(pick: MonthlyPick, index: number): string {
  const labels = pick.pick_labels || {};
  return labels[String(index)] || `Pick ${index + 1}`;
}

export default function MonthlyPicksPage() {
  const { user, isLoading: userLoading } = useUser();
  const [pick, setPick] = useState<MonthlyPick | null>(null);
  const [books, setBooks] = useState<Record<string, Book>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);
  const [isTiebreaking, setIsTiebreaking] = useState(false);
  const [tiebreakResult, setTiebreakResult] = useState<{ winnerId: string; reasoning: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  // Ranked voting state: ordered array of up to 3 book IDs
  const [myRanking, setMyRanking] = useState<string[]>([]);

  const now = new Date();
  const currentMonth = MONTHS[now.getMonth()];
  const currentYear = now.getFullYear();

  const isRevealed = (index: number) => index < revealedCount;

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
      if (data.pick) {
        setRevealedCount(5);
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
    setRevealedCount(0);
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
      await fetchPicks();
      // Notify both users via SMS
      fetch('/api/sms/picks-ready', { method: 'POST' }).catch(() => {});
      // Stagger card reveals
      setRevealedCount(0);
      for (let i = 1; i <= 5; i++) {
        setTimeout(() => setRevealedCount(i), i * 500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  // Start a fresh cycle — resets the completed pick so new ones can be generated
  const handleNewCycle = async () => {
    await handleGenerate();
  };

  // Submit ranked vote
  const handleSubmitVote = async () => {
    if (!user || myRanking.length !== 3) return;
    setIsSubmittingVote(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/monthly-picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', userId: user.id, votes: myRanking }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Vote failed');

      if (data.resolved) {
        await fetchPicks();
      } else if (data.needsTiebreak) {
        handleTiebreak();
      } else {
        await fetchPicks();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Vote failed';
      setError(message);
    } finally {
      setIsSubmittingVote(false);
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

  // Toggle a book in the ranking
  const toggleRank = (bookId: string) => {
    setMyRanking((prev) => {
      const idx = prev.indexOf(bookId);
      if (idx !== -1) {
        return prev.filter((id) => id !== bookId);
      }
      if (prev.length >= 3) return prev;
      return [...prev, bookId];
    });
  };

  const getRankOf = (bookId: string): number => myRanking.indexOf(bookId);

  // Determine voting state
  const userName = user?.name || '';
  const myVotes = userName === 'Greg' ? (pick?.greg_votes || []) : (pick?.mati_votes || []);
  const partnerVotes = userName === 'Greg' ? (pick?.mati_votes || []) : (pick?.greg_votes || []);
  const partnerName = userName === 'Greg' ? 'Mati' : 'Greg';
  const iHaveVoted = myVotes.length === 3;
  const partnerHasVoted = partnerVotes.length === 3;
  const bothVoted = iHaveVoted && partnerHasVoted;

  const pickIds = pick ? getPickIds(pick) : [];
  const isCompleted = pick?.status === 'completed';
  const isReading = pick?.status === 'reading';
  const selectedBook = pick?.selected_book ? books[pick.selected_book] : null;

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

      {/* ─── COMPLETED STATE ─── */}
      {isCompleted && (
        <>
          {/* Celebration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="castle-card p-6 text-center space-y-4 border-gold/40"
          >
            <div className="flex items-center justify-center gap-3">
              <PartyPopper size={24} className="text-gold" />
              <Crown size={28} className="text-gold" />
              <PartyPopper size={24} className="text-gold" />
            </div>
            <p className="font-display text-gold text-lg">Book Completed!</p>
            {selectedBook && (
              <div className="space-y-2">
                <div className="flex justify-center">
                  {selectedBook.cover_url && (
                    <img
                      src={selectedBook.cover_url}
                      alt={selectedBook.title}
                      className="w-20 h-[120px] rounded-lg shadow-lg shadow-black/30 object-cover"
                    />
                  )}
                </div>
                <p className="font-display text-parchment text-base">{selectedBook.title}</p>
                <p className="font-body text-parchment/50 text-sm">{selectedBook.author}</p>
              </div>
            )}
            <p className="font-body text-parchment/50 text-sm leading-relaxed">
              You&apos;ve both finished this month&apos;s read! Don&apos;t forget to rate it and share your hot takes on the book detail page.
            </p>
          </motion.div>

          {/* AI Reasoning from this month */}
          {pick?.ai_reasoning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="castle-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{OWL}</div>
                <div className="flex-1">
                  <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Owliver&apos;s Pick Reasoning</p>
                  <div className="font-body text-parchment/70 text-sm leading-relaxed space-y-2">
                    {pick.ai_reasoning.split('\n\n').map((paragraph, i) => (
                      <p key={i}>{paragraph.replace(/\*\*/g, '')}</p>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Tiebreak reasoning if applicable */}
          {pick?.ai_tiebreak_reasoning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="castle-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{OWL}</div>
                <div className="flex-1">
                  <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Tiebreak Ruling</p>
                  <p className="font-body text-parchment/70 text-sm leading-relaxed">
                    {pick.ai_tiebreak_reasoning}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Generate new picks for next cycle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="castle-card p-6 text-center space-y-4"
          >
            <div className="text-4xl">{OWL}</div>
            <div className="space-y-2">
              <p className="font-display text-gold text-base">Ready for the next chapter?</p>
              <p className="font-body text-parchment/50 text-sm">
                Owliver is ready to pick your next read. Hit the button and the owl will consult both your profiles.
              </p>
            </div>
            <button
              onClick={handleNewCycle}
              disabled={isGenerating}
              className="btn-gold mx-auto flex items-center gap-2"
            >
              {isGenerating ? (
                <><Loader2 size={18} className="animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={18} /> Generate New Picks</>
              )}
            </button>
          </motion.div>
        </>
      )}

      {/* ─── NO PICKS YET ─── */}
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
              Owliver will analyze both your taste profiles and curate five book picks for {currentMonth}.
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

      {/* ─── GENERATING SPINNER ─── */}
      {isGenerating && !isCompleted && (
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

      {/* ─── SELECTED / READING STATE ─── */}
      {pick && (isReading || pick?.status === 'selected') && selectedBook && !isCompleted && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="castle-card p-6 text-center space-y-3 border-gold/40"
          >
            <Crown size={28} className="text-gold mx-auto" />
            <p className="font-display text-gold text-lg">
              {isReading ? 'Currently Reading' : "This Month\u2019s Read"}
            </p>
            {selectedBook.cover_url && (
              <div className="flex justify-center">
                <img
                  src={selectedBook.cover_url}
                  alt={selectedBook.title}
                  className="w-20 h-[120px] rounded-lg shadow-lg shadow-black/30 object-cover"
                />
              </div>
            )}
            <p className="font-display text-parchment text-base">{selectedBook.title}</p>
            <p className="font-body text-parchment/50 text-sm">{selectedBook.author}</p>
            {selectedBook.page_count && (
              <p className="font-body text-parchment/30 text-xs">{selectedBook.page_count} pages</p>
            )}
          </motion.div>

          {/* Owliver's pitch for the selected book only */}
          {pick.ai_reasoning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="castle-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{OWL}</div>
                <div className="flex-1">
                  <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Why This Book</p>
                  <p className="font-body text-parchment/70 text-sm leading-relaxed">
                    {(() => {
                      // Extract only the pitch for the selected book from the full reasoning
                      const paragraphs = pick.ai_reasoning.split('\n\n');
                      // Find the paragraph that mentions the selected book title
                      const bookPitch = paragraphs.find((p) =>
                        p.toLowerCase().includes(selectedBook.title.toLowerCase())
                      );
                      if (bookPitch) {
                        // Strip any bold label prefix like "**Label:** "
                        return bookPitch.replace(/^\*\*[^*]+\*\*:\s*/, '').replace(/\*\*/g, '');
                      }
                      // Fallback: show the overview (first paragraph)
                      return paragraphs[0]?.replace(/\*\*/g, '') || '';
                    })()}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Tiebreak reasoning if applicable */}
          {pick.ai_tiebreak_reasoning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="castle-card p-4"
            >
              <div className="flex items-start gap-3">
                <div className="text-xl flex-shrink-0">{OWL}</div>
                <div className="flex-1">
                  <p className="font-display text-gold text-xs uppercase tracking-wider mb-2">Tiebreak Ruling</p>
                  <p className="font-body text-parchment/70 text-sm leading-relaxed">
                    {pick.ai_tiebreak_reasoning}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* ─── 5 PICK CARDS (voting state) ─── */}
      {pick && !isGenerating && !isCompleted && pick.status === 'voting' && (
        <div className="space-y-4">
          {pickIds.map((bookId, index) => {
            if (!bookId) return null;
            const book = books[bookId];
            if (!book) return null;
            const label = getPickLabel(pick, index);
            const cardRevealed = isRevealed(index);
            const rankIdx = getRankOf(bookId);
            const isRanked = rankIdx !== -1;
            const isSelected = pick.selected_book === bookId;

            return (
              <motion.div
                key={bookId}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={cardRevealed ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <div
                  onClick={() => !iHaveVoted && toggleRank(bookId)}
                  className={`castle-card overflow-hidden transition-all duration-500 ${
                    !iHaveVoted ? 'cursor-pointer active:scale-[0.98]' : ''
                  } ${isRanked ? 'border-gold/50 ring-1 ring-gold/20' : ''} ${
                    isSelected ? 'border-gold ring-1 ring-gold/30' : ''
                  }`}
                >
                  {/* Card header */}
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-gold text-sm tracking-wide">{label}</span>
                    </div>
                    {isRanked && !iHaveVoted && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${RANK_BADGES[rankIdx].color}`}
                      >
                        <span className="font-ui text-[10px] font-bold uppercase tracking-wider">
                          {RANK_BADGES[rankIdx].label} \u2014 {RANK_BADGES[rankIdx].points}pts
                        </span>
                      </motion.div>
                    )}
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

                  {/* Card body */}
                  <div className="px-4 pb-4">
                    <div className="flex gap-4">
                      <div className="w-20 h-[120px] rounded-lg overflow-hidden shadow-lg shadow-black/30 flex-shrink-0 relative">
                        {book.cover_url ? (
                          <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-castle-surface-light flex items-center justify-center">
                            <BookOpen size={24} className="text-parchment/20" />
                          </div>
                        )}
                        {/* Rank badge overlay on cover */}
                        {isRanked && iHaveVoted && (
                          <div className={`absolute top-0 left-0 right-0 ${RANK_BADGES[rankIdx].color} text-center py-0.5`}>
                            <span className="text-[10px] font-ui font-bold uppercase tracking-wider">
                              {RANK_BADGES[rankIdx].label}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <p className="font-display text-parchment text-base leading-tight">{book.title}</p>
                        <p className="font-body text-parchment/50 text-sm">{book.author}</p>
                        {book.genres && book.genres.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {book.genres.slice(0, 3).map((g) => (
                              <span key={g} className="text-[9px] font-ui uppercase tracking-wider text-gold/60 bg-gold/5 px-1.5 py-0.5 rounded">{g}</span>
                            ))}
                          </div>
                        )}
                        {book.page_count && (
                          <p className="font-body text-parchment/30 text-xs">{book.page_count} pages</p>
                        )}
                      </div>
                    </div>

                    {/* Vote indicators after voting */}
                    {iHaveVoted && (
                      <div className="mt-3 flex items-center gap-2">
                        {myVotes.indexOf(bookId) !== -1 && (
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${
                            RANK_BADGES[myVotes.indexOf(bookId)]?.color || 'bg-gold/10'
                          }`}>
                            <span className="font-ui text-[10px] font-bold uppercase tracking-wider">
                              Your #{myVotes.indexOf(bookId) + 1}
                            </span>
                          </div>
                        )}
                        {partnerHasVoted && partnerVotes.indexOf(bookId) !== -1 && (
                          <div className="flex items-center gap-1.5 bg-crimson/10 px-3 py-1.5 rounded-full">
                            <span className="font-ui text-[10px] text-crimson-light uppercase tracking-wider">
                              {partnerName}&apos;s #{partnerVotes.indexOf(bookId) + 1}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ─── VOTING CONTROLS (before submitting) ─── */}
      {pick?.status === 'voting' && !iHaveVoted && !isGenerating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.8 }}
          className="space-y-3"
        >
          {/* Ranking summary */}
          <div className="castle-card p-4 text-center space-y-2">
            <p className="font-display text-gold text-sm">
              {myRanking.length === 0
                ? 'Tap your top 3 picks in order'
                : myRanking.length < 3
                ? `${3 - myRanking.length} more to go`
                : 'Ready to submit!'}
            </p>
            {myRanking.length > 0 && (
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {myRanking.map((id, i) => {
                  const b = books[id];
                  return (
                    <div key={id} className="flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-ui font-bold ${RANK_BADGES[i].color}`}>
                        {i + 1}
                      </span>
                      <span className="font-body text-parchment/60 text-xs max-w-[90px] truncate">
                        {b?.title || '?'}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleRank(id); }}
                        className="text-parchment/30 hover:text-parchment/60 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="font-body text-parchment/30 text-[10px]">
              1st = 3 pts \u00B7 2nd = 2 pts \u00B7 3rd = 1 pt
            </p>
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmitVote}
            disabled={myRanking.length !== 3 || isSubmittingVote}
            className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmittingVote ? (
              <><Loader2 size={16} className="animate-spin" /> Submitting...</>
            ) : (
              <><Crown size={16} /> Lock In My Ranking</>
            )}
          </button>
        </motion.div>
      )}

      {/* ─── WAITING FOR PARTNER ─── */}
      {pick?.status === 'voting' && iHaveVoted && !partnerHasVoted && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="castle-card p-5 text-center space-y-2"
        >
          <div className="text-2xl">{OWL}</div>
          <p className="font-display text-gold text-sm">Your ranking is locked in!</p>
          <p className="font-body text-parchment/50 text-xs">
            Waiting for {partnerName} to submit their top 3. Owliver will tally the scores once both votes are in.
          </p>
        </motion.div>
      )}

      {/* ─── TIEBREAK NEEDED ─── */}
      {pick && bothVoted && !pick.selected_book && pick.status === 'voting' && !tiebreakResult && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="castle-card p-6 text-center space-y-4"
        >
          <div className="text-3xl">{OWL}</div>
          <div className="space-y-1">
            <p className="font-display text-gold text-base">A disagreement in the tower!</p>
            <p className="font-body text-parchment/50 text-sm">
              The scores are tied. Owliver will break the deadlock.
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

      {/* ─── TIEBREAK RESULT (voting state) ─── */}
      <AnimatePresence>
        {!isCompleted && pick?.status === 'voting' && (tiebreakResult || pick?.ai_tiebreak_reasoning) && (
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

      {/* ─── AI REASONING (voting state only — full pick pitches) ─── */}
      {pick?.ai_reasoning && !isGenerating && !isCompleted && pick.status === 'voting' && (
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

      {/* ─── REGENERATE (voting state only, before voting) ─── */}
      {pick && pick.status === 'voting' && !iHaveVoted && !isGenerating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3.5 }}
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