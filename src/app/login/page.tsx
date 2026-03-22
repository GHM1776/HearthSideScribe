'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { Suspense } from 'react';

const OWL = '\u{1F989}';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const isUnauthorized = searchParams.get('error') === 'unauthorized';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (authError) { setError(authError.message); setStatus('error'); }
    else { setStatus('sent'); }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="w-full max-w-sm text-center space-y-8">
        <div className="candle-glow space-y-3 relative z-10">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="text-5xl">{OWL}</motion.div>
          <h1 className="font-display-decorative text-gold text-2xl text-glow tracking-wider">HearthsideScribe</h1>
          <h2 className="font-display text-gold-bright/80 text-lg tracking-widest uppercase">Book Club</h2>
          <p className="font-body text-parchment/40 text-sm italic mt-4">&ldquo;A castle library for two&rdquo;</p>
        </div>

        {isUnauthorized && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="castle-card p-4 flex items-start gap-3 border border-crimson/30"
          >
            <Lock size={16} className="text-crimson-light flex-shrink-0 mt-0.5" />
            <p className="font-body text-parchment/70 text-sm text-left">
              This library is private. Only its two members may enter.
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {status === 'sent' ? (
            <motion.div key="sent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="castle-card p-6 space-y-4">
              <CheckCircle className="text-gold mx-auto" size={32} />
              <p className="font-display text-gold text-base">Scroll sent!</p>
              <p className="font-body text-parchment/60 text-sm leading-relaxed">
                The owl has delivered a magic link to <span className="text-parchment">{email}</span>.<br />
                Check your inbox and tap the link to enter the tower.
              </p>
            </motion.div>
          ) : (
            <motion.form key="form" onSubmit={handleSubmit} className="castle-card p-6 space-y-4">
              <label className="block text-left">
                <span className="font-display text-parchment/60 text-xs tracking-wider uppercase">Your Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="mati@example.com" required autoComplete="email" autoFocus className="input-castle mt-2" />
              </label>
              {status === 'error' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-2 text-crimson-light text-sm font-body">
                  <AlertCircle size={14} />{error}
                </motion.div>
              )}
              <button type="submit" disabled={status === 'loading' || !email}
                className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {status === 'loading' ? (
                  <><div className="w-4 h-4 border-2 border-castle-bg/30 border-t-castle-bg rounded-full animate-spin" />Sending owl...</>
                ) : (
                  <><Send size={16} />Send me a magic link</>
                )}
              </button>
              <p className="text-parchment/30 text-xs font-body">The owl will send a scroll to your inbox</p>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}