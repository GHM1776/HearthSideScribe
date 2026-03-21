'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Check, Loader2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import BookSearch from '@/components/BookSearch';

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

interface BookPill {
  book: SelectedBook;
  id: string;
}

const STEPS = [
  {
    id: 'favorite',
    question: "First things first — what's your all-time favorite book?",
    hint: "The one you'd recommend to anyone, no hesitation.",
    type: 'single-book',
  },
  {
    id: 'compelling',
    question: "In your own words, what makes a book impossible to put down?",
    hint: "Themes, pacing, prose style, characters — whatever it is for you.",
    type: 'text',
  },
  {
    id: 'dnf',
    question: "Any books you started but couldn't finish?",
    hint: "Add up to 3. This helps me learn what to avoid. Skip if none come to mind.",
    type: 'multi-book',
    max: 3,
    optional: true,
  },
  {
    id: 'recent',
    question: "Add 8 books you've read recently and enjoyed.",
    hint: "The more you add, the better I can tailor picks for you.",
    type: 'multi-book',
    max: 8,
    optional: false,
    min: 3,
  },
  {
    id: 'avoids',
    question: "Anything you'd rather not read? Genres, themes, tropes?",
    hint: "e.g. 'no graphic violence', 'not a fan of romance subplots', 'anything but vampire fiction'",
    type: 'text',
    optional: true,
  },
];

function BookPillList({ books, onRemove }: { books: BookPill[]; onRemove: (id: string) => void }) {
  if (books.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
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
    </div>
  );
}

function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i < current
              ? 'w-2 h-2 bg-gold'
              : i === current
              ? 'w-3 h-3 bg-gold border-2 border-gold/50'
              : 'w-2 h-2 bg-castle-border'
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const { user } = useUser();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step answers
  const [favoriteBook, setFavoriteBook] = useState<SelectedBook | null>(null);
  const [compellingText, setCompellingText] = useState('');
  const [dnfBooks, setDnfBooks] = useState<BookPill[]>([]);
  const [recentBooks, setRecentBooks] = useState<BookPill[]>([]);
  const [avoidsText, setAvoidsText] = useState('');

  const currentStep = STEPS[step];

  const canAdvance = () => {
    if (currentStep.id === 'favorite') return !!favoriteBook;
    if (currentStep.id === 'compelling') return compellingText.trim().length > 10;
    if (currentStep.id === 'dnf') return true; // optional
    if (currentStep.id === 'recent') return recentBooks.length >= (currentStep.min || 0);
    if (currentStep.id === 'avoids') return true; // optional
    return false;
  };

  const addBook = (book: SelectedBook, list: BookPill[], setList: (b: BookPill[]) => void, max: number) => {
    if (list.length >= max) return;
    const already = list.some(
      (bp) => bp.book.title.toLowerCase() === book.title.toLowerCase()
    );
    if (already) return;
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
    if (!user) return;
    setIsSubmitting(true);

    try {
      await fetch('/api/ai/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          favoriteBook,
          compellingText,
          dnfBooks: dnfBooks.map((bp) => bp.book),
          recentBooks: recentBooks.map((bp) => bp.book),
          avoidsText,
        }),
      });

      router.push('/');
    } catch (err) {
      console.error('Onboarding error:', err);
      router.push('/');
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">

        {/* Owliver header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-2"
        >
          <div className="text-5xl">{OWL}</div>
          <h1 className="font-display-decorative text-gold text-xl text-glow tracking-wider">
            HearthsideScribe
          </h1>
          <p className="font-body text-parchment/40 text-xs italic">
            Let&apos;s build your reading profile
          </p>
        </motion.div>

        <ProgressDots total={STEPS.length} current={step} />

        {/* Step card */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.3 }}
            className="castle-card p-6 space-y-4"
          >
            {/* Owliver speech bubble */}
            <div className="space-y-1">
              <p className="font-display text-parchment text-base leading-snug">
                {currentStep.question}
              </p>
              <p className="font-body text-parchment/40 text-xs leading-relaxed">
                {currentStep.hint}
              </p>
            </div>

            {/* Input area */}
            {currentStep.type === 'single-book' && (
              <div className="space-y-3">
                <BookSearch onSelect={(book) => setFavoriteBook(book)} />
                {favoriteBook && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
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
                    <button
                      onClick={() => setFavoriteBook(null)}
                      className="text-parchment/30 hover:text-parchment/60 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </motion.div>
                )}
              </div>
            )}

            {currentStep.type === 'text' && (
              <textarea
                value={currentStep.id === 'compelling' ? compellingText : avoidsText}
                onChange={(e) =>
                  currentStep.id === 'compelling'
                    ? setCompellingText(e.target.value)
                    : setAvoidsText(e.target.value)
                }
                placeholder={currentStep.id === 'compelling'
                  ? "I love books that..."
                  : "I tend to avoid..."}
                className="input-castle resize-none h-28 w-full"
                maxLength={500}
              />
            )}

            {currentStep.type === 'multi-book' && (
              <div className="space-y-3">
                {currentStep.id === 'dnf' && dnfBooks.length < (currentStep.max || 3) && (
                  <BookSearch onSelect={(book) => addBook(book, dnfBooks, setDnfBooks, currentStep.max || 3)} />
                )}
                {currentStep.id === 'recent' && recentBooks.length < (currentStep.max || 8) && (
                  <BookSearch onSelect={(book) => addBook(book, recentBooks, setRecentBooks, currentStep.max || 8)} />
                )}

                <AnimatePresence>
                  {currentStep.id === 'dnf' && (
                    <BookPillList books={dnfBooks} onRemove={(id) => removeBook(id, dnfBooks, setDnfBooks)} />
                  )}
                  {currentStep.id === 'recent' && (
                    <BookPillList books={recentBooks} onRemove={(id) => removeBook(id, recentBooks, setRecentBooks)} />
                  )}
                </AnimatePresence>

                {/* Count indicator */}
                <p className="font-ui text-parchment/30 text-xs text-right">
                  {currentStep.id === 'dnf' ? dnfBooks.length : recentBooks.length}
                  {' / '}{currentStep.max}
                  {currentStep.min && currentStep.id === 'recent' && recentBooks.length < currentStep.min
                    ? ` — add at least ${currentStep.min}`
                    : ''}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
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
            ) : (
              <>Next <ChevronRight size={18} /></>
            )}
          </button>

          {currentStep.optional && step < STEPS.length - 1 && (
            <button
              onClick={advance}
              className="text-parchment/30 text-xs font-body text-center py-1"
            >
              Skip this one
            </button>
          )}
        </div>

        {/* Step label */}
        <p className="text-center font-ui text-parchment/20 text-xs tracking-wider uppercase">
          Step {step + 1} of {STEPS.length}
        </p>

      </div>
    </div>
  );
}