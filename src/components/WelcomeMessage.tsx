'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const OWL = '\u{1F989}';

interface WelcomeMessageProps {
  userName: string;
  userId: string;
}

export default function WelcomeMessage({ userName, userId }: WelcomeMessageProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function fetchWelcome() {
      try {
        const res = await fetch('/api/ai/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        setMessage(data.message);
        setIsLoading(false);
      } catch (err: unknown) {
        // If aborted (unmount / StrictMode cleanup), do nothing — no fallback, no state update
        if (err instanceof DOMException && err.name === 'AbortError') return;

        // Real failure — use a fallback
        const fallbacks = [
          `Welcome back, ${userName}! The tower library awaits.`,
          `Good to see you, ${userName}! I've been rearranging the shelves.`,
          `Look hoo's here! Welcome back, ${userName}.`,
        ];
        setMessage(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
        setIsLoading(false);
      }
    }

    fetchWelcome();

    return () => {
      controller.abort();
    };
  }, [userName, userId]);

  // Typewriter effect — only runs once when message is set
  useEffect(() => {
    if (!message) return;
    let index = 0;
    setDisplayedText('');
    const interval = setInterval(() => {
      if (index < message.length) {
        setDisplayedText(message.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [message]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="castle-card p-4 mx-auto max-w-lg"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{OWL}</div>
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-gold/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-parchment/40 font-body text-sm italic">Owliver is thinking...</span>
              </div>
            ) : (
              <p className="font-body text-parchment/90 text-[15px] leading-relaxed">
                {displayedText}
                {displayedText.length < (message?.length || 0) && (
                  <span className="inline-block w-0.5 h-4 bg-gold/70 ml-0.5 animate-pulse" />
                )}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}