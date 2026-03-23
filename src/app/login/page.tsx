'use client';

import { useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Lock, ArrowLeft } from 'lucide-react';
import { Suspense } from 'react';

const OWL = '\u{1F989}';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'verifying' | 'error'>('idle');
  const [error, setError] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const searchParams = useSearchParams();
  const router = useRouter();
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

    if (authError) {
      setError(authError.message);
      setStatus('error');
    } else {
      setStatus('sent');
      // Focus first OTP input after render
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (digit && index < 7) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 7) {
      const code = newDigits.join('');
      if (code.length === 6) {
        verifyOtp(code);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;

    const newDigits = [...otpDigits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    // Focus the next empty input or last input
    const nextEmpty = newDigits.findIndex((d) => !d);
    if (nextEmpty >= 0) {
      inputRefs.current[nextEmpty]?.focus();
    } else {
      inputRefs.current[7]?.focus();
      // All 6 filled — auto-submit
      verifyOtp(newDigits.join(''));
    }
  };

  const verifyOtp = async (code: string) => {
    setStatus('verifying');
    setError('');

    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });

    if (verifyError) {
      setError(verifyError.message);
      setStatus('sent');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } else {
      // Success — redirect to home
      router.push('/');
      router.refresh();
    }
  };

  const handleBack = () => {
    setStatus('idle');
    setError('');
    setOtpDigits(['', '', '', '', '', '']);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-sm text-center space-y-8"
      >
        <div className="candle-glow space-y-3 relative z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-5xl"
          >
            {OWL}
          </motion.div>
          <h1 className="font-display-decorative text-gold text-2xl text-glow tracking-wider">
            HearthsideScribe
          </h1>
          <h2 className="font-display text-gold-bright/80 text-lg tracking-widest uppercase">
            Book Club
          </h2>
          <p className="font-body text-parchment/40 text-sm italic mt-4">
            &ldquo;A castle library for two&rdquo;
          </p>
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
          {status === 'sent' || status === 'verifying' ? (
            <motion.div
              key="otp"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="castle-card p-6 space-y-5"
            >
              <CheckCircle className="text-gold mx-auto" size={32} />
              <div className="space-y-1">
                <p className="font-display text-gold text-base">Check your inbox</p>
                <p className="font-body text-parchment/60 text-sm leading-relaxed">
                  A 6-digit code was sent to{' '}
                  <span className="text-parchment">{email}</span>
                </p>
              </div>

              {/* OTP input */}
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={status === 'verifying'}
                    className="w-11 h-13 text-center text-xl font-display text-gold bg-castle-surface border border-castle-border rounded-lg focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30 disabled:opacity-50 transition-colors"
                  />
                ))}
              </div>

              {status === 'verifying' && (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
                  <span className="font-body text-parchment/50 text-sm">Verifying...</span>
                </div>
              )}

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-2 text-crimson-light text-sm font-body justify-center"
                >
                  <AlertCircle size={14} />
                  {error}
                </motion.div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={handleBack}
                  className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
                >
                  <ArrowLeft size={14} /> Use a different email
                </button>
                <p className="text-parchment/25 text-xs font-body">
                  The email also includes a magic link you can tap instead
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="castle-card p-6 space-y-4"
            >
              <label className="block text-left">
                <span className="font-display text-parchment/60 text-xs tracking-wider uppercase">
                  Your Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mati@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                  className="input-castle mt-2"
                />
              </label>

              {status === 'error' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center gap-2 text-crimson-light text-sm font-body"
                >
                  <AlertCircle size={14} />
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={status === 'loading' || !email}
                className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-castle-bg/30 border-t-castle-bg rounded-full animate-spin" />
                    Sending owl...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send me a code
                  </>
                )}
              </button>
              <p className="text-parchment/30 text-xs font-body">
                We&apos;ll send a 6-digit code to your inbox
              </p>
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