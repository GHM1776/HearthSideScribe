'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, PlusCircle, Calendar, Sparkles, LogOut, ChevronRight, X, Check, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { createClient } from '@/lib/supabase/client';
import WelcomeMessage from '@/components/WelcomeMessage';
import BottomNav from '@/components/BottomNav';
import BookSearch from '@/components/BookSearch';
import type { UserBook, Book } from '@/lib/types';

const OWL = '\u{1F989}';
const FIRE = '\u{1F525}';

interface BookStats {
  totalRead: number;
  currentlyReading: (UserBook & { book: Book })[];
  wantToRead: number;
  averageRating: number;
}

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

interface BookPill {
  book: SelectedBook;
  id: string;
}

const STEPS = [
  {
    id: 'welcome',
    question: "Hoo's there! Welcome to the tower library.",
    subtext: "Before I can recommend books worth your time, I need to learn your taste. This will only take a few minutes.",
    type: 'intro',
  },
  {
    id: 'favorite',
    question: "What's your all-time favorite book?",
    hint: "The one you'd press into anyone's hands without hesitation.",
    type: 'single-book',
  },
  {
    id: 'compelling',
    question: "In your own words — what makes a book impossible to put down?",
    hint: "Themes, pacing, prose, characters. Whatever it is for you.",
    type: 'text',
  },
  {
    id: 'recent',
    question: "Add 8 books you've read recently and enjoyed.",
    hint: "The more you add, the better my recommendations.",
    type: 'multi-book',
    max: 8,
    min: 3,
    optional: false,
  },
  {
    id: 'dnf',
    question: "Any books you couldn't finish?",
    hint: "Add up to 3. Helps me learn what to avoid. Skip if none come to mind.",
    type: 'multi-book',
    max: 3,
    optional: true,
  },
  {
    id: 'avoids',
    question: "Anything you'd rather not read?",
    hint: "Genres, themes, tropes — e.g. 'no graphic violence', 'skip the vampire stuff'",
    type: 'text',
    optional: true,
  },
];

// ─── Book Pill Component ─────────────────────────────────────
function BookPillList({ books, onRemove }: { books: BookPill[]; onRemove: (id: string) => void }) {
  if (books.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      <AnimatePresence>
        {books.map((bp) => (
          <motion.div
            key={bp.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-full pl-2 pr-1 py-1"
          >
            {bp.book.cover_url && (
              <img src={bp.book.cover_url} alt="" className="w-5 h-7 rounded object-cover flex-shrink-0" />
            )}
            <span className="font-display text-gold text-xs max-w-[140px] truncate">{bp.book.title}</span>
            <button
              onClick={() => onRemove(bp.id)}
              className="w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center flex-shrink-0 hover:bg-gold/40 transition-colors"
            >
              <X size={10} className="text-gold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Progress Dots ───────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current ? 'w-2 h-2 bg-gold' :
            i === current ? 'w-3 h-3 bg-gold border-2 border-gold/40' :
            'w-2 h-2 bg-castle-border'
          }`}
        />
      ))}
    </div>
  );
}

function OnboardingModal({ userId, onComplete }: { userId: string; onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [favoriteBook, setFavoriteBook] = useState<SelectedBook | null>(null);
  const [compellingText, setCompellingText] = useState('');
  const [dnfBooks, setDnfBooks] = useState<BookPill[]>([]);
  const [recentBooks, setRecentBooks] = useState<BookPill[]>([]);
  const [avoidsText, setAvoidsText] = useState('');

  const currentStep = STEPS[step];

  const canAdvance = () => {
    if (currentStep.id === 'welcome') return true;
    if (currentStep.id === 'favorite') return !!favoriteBook;
    if (currentStep.id === 'compelling') return compellingText.trim().length > 10;
    if (currentStep.id === 'recent') return recentBooks.length >= ((currentStep as any).min || 0);
    return true; // optional steps
  };

  const addBook = (book: SelectedBook, list: BookPill[], setList: (b: BookPill[]) => void, max: number) => {
    if (list.length >= max) return;
    if (list.some((bp) => bp.book.title.toLowerCase() === book.title.toLowerCase())) return;
    setList([...list, { book, id: `${Date.now()}-${Math.random()}` }]);
  };

  const removeBook = (id: string, list: BookPill[], setList: (b: BookPill[]) => void) => {
    setList(list.filter((bp) => bp.id !== id));
  };

  const advance = () => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/ai/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          favoriteBook,
          compellingText,
          dnfBooks: dnfBooks.map((bp) => bp.book),
          recentBooks: recentBooks.map((bp) => bp.book),
          avoidsText,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Onboarding failed:', data.error);
      }

      // Fire-and-forget avatar generation from the CLIENT
      // (browser request carries auth cookies → Supabase RLS works)
      fetch('/api/ai/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }).catch((err) => console.error('Avatar generation failed:', err));

    } catch (err) {
      console.error('Onboarding error:', err);
    } finally {
      setIsSubmitting(false);
      setShowSuccess(true);
      setTimeout(() => {
        onComplete();
      }, 3000);
    }
  };

  // ─── Success Screen ──────────────────────────────────────────
  if (showSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: 'rgba(10, 8, 6, 0.93)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="text-center space-y-6 max-w-sm"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', damping: 12 }}
            className="text-6xl"
          >
            {OWL}
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-2"
          >
            <h2 className="font-display-decorative text-gold text-xl text-glow tracking-wider">
              Profile Complete!
            </h2>
            <p className="font-body text-parchment/60 text-sm leading-relaxed">
              Owliver has studied your tastes and is ready to start recommending books. Your reading portrait is being painted in the tower...
            </p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2 text-gold/40"
          >
            <Sparkles size={14} />
            <span className="font-ui text-xs uppercase tracking-wider">Preparing the library...</span>
            <Sparkles size={14} />
          </motion.div>
        </motion.div>
      </motion.div>
    );
  }

  // ─── Onboarding Steps ────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto"
      style={{ background: 'rgba(10, 8, 6, 0.93)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="w-full max-w-sm space-y-6 my-auto"
      >
        <div className="text-center space-y-2">
          <div className="text-5xl">{OWL}</div>
          <h2 className="font-display-decorative text-gold text-xl text-glow tracking-wider">Meet Owliver</h2>
          <p className="font-body text-parchment/40 text-xs italic">Your personal library owl</p>
        </div>

        <ProgressDots total={STEPS.length} current={step} />

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: direction * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -50 }}
            transition={{ duration: 0.25 }}
            className="castle-card p-6 space-y-4"
          >
            <div className="space-y-1">
              <p className="font-display text-parchment text-base leading-snug">{currentStep.question}</p>
              {'hint' in currentStep && currentStep.hint && (
                <p className="font-body text-parchment/40 text-xs leading-relaxed">{currentStep.hint}</p>
              )}
              {'subtext' in currentStep && currentStep.subtext && (
                <p className="font-body text-parchment/50 text-sm leading-relaxed mt-2">{currentStep.subtext}</p>
              )}
            </div>

            {currentStep.type === 'single-book' && (
              <div className="space-y-3">
                {!favoriteBook && <BookSearch onSelect={setFavoriteBook} />}
                {favoriteBook && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 bg-gold/10 border border-gold/30 rounded-xl p-3"
                  >
                    {favoriteBook.cover_url && (
                      <img src={favoriteBook.cover_url} alt="" className="w-10 h-14 rounded object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-gold text-sm truncate">{favoriteBook.title}</p>
                      <p className="font-body text-parchment/50 text-xs">{favoriteBook.author}</p>
                    </div>
                    <button onClick={() => setFavoriteBook(null)} className="text-parchment/30 hover:text-parchment/60 transition-colors p-1">
                      <X size={16} />
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {currentStep.type === 'text' && (
              <textarea
                value={currentStep.id === 'compelling' ? compellingText : avoidsText}
                onChange={(e) => currentStep.id === 'compelling' ? setCompellingText(e.target.value) : setAvoidsText(e.target.value)}
                placeholder={currentStep.id === 'compelling' ? "I love books that..." : "I tend to avoid..."}
                className="input-castle resize-none h-24 w-full"
                maxLength={500}
              />
            )}

            {currentStep.type === 'multi-book' && (
              <div className="space-y-2">
                {currentStep.id === 'recent' && recentBooks.length < ((currentStep as any).max || 8) && (
                  <BookSearch onSelect={(b) => addBook(b, recentBooks, setRecentBooks, (currentStep as any).max || 8)} />
                )}
                {currentStep.id === 'dnf' && dnfBooks.length < ((currentStep as any).max || 3) && (
                  <BookSearch onSelect={(b) => addBook(b, dnfBooks, setDnfBooks, (currentStep as any).max || 3)} />
                )}
                {currentStep.id === 'recent' && (
                  <BookPillList books={recentBooks} onRemove={(id) => removeBook(id, recentBooks, setRecentBooks)} />
                )}
                {currentStep.id === 'dnf' && (
                  <BookPillList books={dnfBooks} onRemove={(id) => removeBook(id, dnfBooks, setDnfBooks)} />
                )}
                <p className="font-ui text-parchment/25 text-xs text-right">
                  {currentStep.id === 'recent' ? recentBooks.length : dnfBooks.length} / {(currentStep as any).max}
                  {(currentStep as any).min && currentStep.id === 'recent' && recentBooks.length < (currentStep as any).min
                    ? ` \u2014 add at least ${(currentStep as any).min}` : ''}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-col gap-3">
          <button
            onClick={advance}
            disabled={!canAdvance() || isSubmitting}
            className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <><Loader2 size={18} className="animate-spin" />Owliver is studying your tastes...</>
            ) : step === STEPS.length - 1 ? (
              <><Check size={18} />Build my reading profile</>
            ) : currentStep.id === 'welcome' ? (
              <>Let&apos;s go {OWL}</>
            ) : (
              <>Next <ChevronRight size={18} /></>
            )}
          </button>

          {'optional' in currentStep && currentStep.optional && step < STEPS.length - 1 && (
            <button onClick={advance} className="text-parchment/30 text-xs font-body text-center py-1 hover:text-parchment/50 transition-colors">
              Skip this one
            </button>
          )}
        </div>

        <p className="text-center font-ui text-parchment/20 text-[10px] tracking-wider uppercase">
          Step {step + 1} of {STEPS.length}
        </p>
      </motion.div>
    </motion.div>
  );
}

// ─── Gateway ─────────────────────────────────────────────────
function Gateway({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className="text-center space-y-6 max-w-xs"
      >
        <div className="candle-glow relative z-10">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, delay: 0.3 }} className="text-6xl">
            {OWL}
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-2">
          <h1 className="font-display-decorative text-gold text-2xl text-glow tracking-wider">HearthsideScribe</h1>
          <p className="font-body text-parchment/30 text-sm italic">The tower library awaits</p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          onClick={onEnter}
          className="btn-gold text-base px-8 py-4 flex items-center justify-center gap-2 mx-auto animate-glow-pulse"
        >
          {FIRE} Enter the Library
        </motion.button>
      </motion.div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────
function Dashboard({ user }: { user: { id: string; name: string } }) {
  const router = useRouter();
  const [stats, setStats] = useState<BookStats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createClient();
      const { data: userBooks } = await supabase
        .from('user_books')
        .select('*, book:books(*)')
        .eq('user_id', user.id);

      if (userBooks) {
        const read = userBooks.filter((ub) => ub.status === 'read');
        const ratings = read.filter((ub) => ub.rating).map((ub) => ub.rating!);
        const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
        setStats({
          totalRead: read.length,
          currentlyReading: userBooks.filter((ub) => ub.status === 'reading') as (UserBook & { book: Book })[],
          wantToRead: userBooks.filter((ub) => ub.status === 'want_to_read').length,
          averageRating: Math.round(avg * 10) / 10,
        });
      }
    }
    fetchStats();
  }, [user.id]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('bookclub-entered');
    sessionStorage.removeItem('bookclub-onboarded');
    router.push('/login');
  };

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between pt-2">
        <div className="candle-glow text-center flex-1">
          <h1 className="font-display-decorative text-gold text-xl text-glow tracking-wider">HearthsideScribe</h1>
          <p className="font-body text-parchment/40 text-xs">The Tower Library</p>
        </div>
        <button onClick={handleSignOut} className="text-parchment/30 hover:text-parchment/60 transition-colors p-2 flex-shrink-0" aria-label="Sign out">
          <LogOut size={18} />
        </button>
      </motion.header>

      <WelcomeMessage userName={user.name} userId={user.id} />

      {stats && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="grid grid-cols-3 gap-3">
          <div className="castle-card p-3 text-center">
            <p className="font-display text-gold text-2xl">{stats.totalRead}</p>
            <p className="font-ui text-parchment/40 text-[10px] uppercase tracking-wider">Books Read</p>
          </div>
          <div className="castle-card p-3 text-center">
            <p className="font-display text-gold text-2xl">{stats.wantToRead}</p>
            <p className="font-ui text-parchment/40 text-[10px] uppercase tracking-wider">Want to Read</p>
          </div>
          <div className="castle-card p-3 text-center">
            <p className="font-display text-gold text-2xl">{stats.averageRating || '\u2014'}</p>
            <p className="font-ui text-parchment/40 text-[10px] uppercase tracking-wider">Avg Rating</p>
          </div>
        </motion.div>
      )}

      {stats?.currentlyReading && stats.currentlyReading.length > 0 && (
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h2 className="section-heading mb-3">Currently Reading</h2>
          <div className="space-y-3">
            {stats.currentlyReading.map((ub) => (
              <div key={ub.id} className="castle-card-hover p-4 flex gap-4 items-center cursor-pointer" onClick={() => router.push(`/book/${ub.book_id}`)}>
                {ub.book?.cover_url ? (
                  <img src={ub.book.cover_url} alt={ub.book.title} className="w-12 h-18 rounded shadow-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-18 rounded bg-castle-surface-light flex items-center justify-center flex-shrink-0">
                    <BookOpen size={20} className="text-parchment/20" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-display text-parchment text-sm truncate">{ub.book?.title}</p>
                  <p className="font-body text-parchment/50 text-xs">{ub.book?.author}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="space-y-3">
        <h2 className="section-heading">Quick Actions</h2>
        <button onClick={() => router.push('/add-book')} className="castle-card-hover p-4 w-full flex items-center gap-4 text-left">
          <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0"><PlusCircle size={20} className="text-gold" /></div>
          <div><p className="font-display text-parchment text-sm">Add a Book</p><p className="font-body text-parchment/40 text-xs">Log something you&apos;ve read or want to read</p></div>
        </button>
        <button onClick={() => router.push('/monthly-picks')} className="castle-card-hover p-4 w-full flex items-center gap-4 text-left">
          <div className="w-10 h-10 rounded-lg bg-crimson/20 flex items-center justify-center flex-shrink-0"><Calendar size={20} className="text-crimson-light" /></div>
          <div><p className="font-display text-parchment text-sm">Monthly Picks</p><p className="font-body text-parchment/40 text-xs">See this month&apos;s AI recommendations</p></div>
        </button>
        <button onClick={() => router.push('/bookshelf')} className="castle-card-hover p-4 w-full flex items-center gap-4 text-left">
          <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0"><Sparkles size={20} className="text-gold" /></div>
          <div><p className="font-display text-parchment text-sm">Browse the Shelf</p><p className="font-body text-parchment/40 text-xs">Your complete library at a glance</p></div>
        </button>
      </motion.section>

      <BottomNav />
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function HomePage() {
  const { user, isLoading: userLoading } = useUser();
  const router = useRouter();
  const [hasEntered, setHasEntered] = useState<boolean | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    const entered = sessionStorage.getItem('bookclub-entered');
    setHasEntered(entered === 'true');
  }, []);

  useEffect(() => {
    if (!user) return;
    const cached = sessionStorage.getItem('bookclub-onboarded');
    if (cached === 'true') { setNeedsOnboarding(false); return; }

    async function checkOnboarding() {
      const supabase = createClient();
      const { data: profile } = await supabase
        .from('taste_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (profile) {
        sessionStorage.setItem('bookclub-onboarded', 'true');
        setNeedsOnboarding(false);
      } else {
        setNeedsOnboarding(true);
      }
    }
    checkOnboarding();
  }, [user]);

  const handleEnter = useCallback(() => {
    sessionStorage.setItem('bookclub-entered', 'true');
    window.dispatchEvent(new Event('start-ambient'));
    setHasEntered(true);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    sessionStorage.setItem('bookclub-onboarded', 'true');
    setNeedsOnboarding(false);
  }, []);

  const isLoading = userLoading || hasEntered === null || (!!user && needsOnboarding === null);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-pulse">{OWL}</div>
          <p className="font-body text-parchment/40 text-sm italic">Opening the tower doors...</p>
        </div>
      </div>
    );
  }

  if (!user) { router.push('/login'); return null; }

  return (
    <>
      <AnimatePresence>
        {needsOnboarding && (
          <OnboardingModal userId={user.id} onComplete={handleOnboardingComplete} />
        )}
      </AnimatePresence>

      {!hasEntered ? (
        <Gateway onEnter={handleEnter} />
      ) : (
        <Dashboard user={user} />
      )}
    </>
  );
}