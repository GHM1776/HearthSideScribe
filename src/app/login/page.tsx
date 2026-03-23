'use client';

import { useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle, AlertCircle, Lock, ArrowLeft } from 'lucide-react';
import { Suspense } from 'react';

const OWL = '\u{1F989}';
const CODE_LENGTH = 8;

function LoginContent() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'verifying' | 'error'>('idle');
  const [error, setError] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
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
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  };

  const verifyOtp = async (code: string) => {
    if (code.length !== CODE_LENGTH) return;
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
      setOtpDigits(Array(CODE_LENGTH).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits filled
    if (digit && index === CODE_LENGTH - 1) {
      const code = newDigits.join('');
      if (code.length === CODE_LENGTH) {
        verifyOtp(code);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      const code = otpDigits.join('');
      if (code.length === CODE_LENGTH) {
        verifyOtp(code);
      }
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (pasted.length === 0) return;

    const newDigits = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setOtpDigits(newDigits);

    const nextEmpty = newDigits.findIndex((d) => !d);
    if (nextEmpty >= 0) {
      inputRefs.current[nextEmpty]?.focus();
    } else {
      inputRefs.current[CODE_LENGTH - 1]?.focus();
      verifyOtp(newDigits.join(''));
    }
  };

  const handleVerifyClick = () => {
    const code = otpDigits.join('');
    if (code.length === CODE_LENGTH) {
      verifyOtp(code);
    }
  };

  const handleBack = () => {
    setStatus('idle');
    setError('');
    setOtpDigits(Array(CODE_LENGTH).fill(''));
  };

  const codeFilled = otpDigits.every((d) => d !== '');

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
                  A code was sent to{' '}
                  <span className="text-parchment">{email}</span>
                </p>
              </div>

              {/* OTP input */}
              <div className="flex justify-center gap-1.5" onPaste={handleOtpPaste}>
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    disabled={status === 'verifying'}
                    className="w-9 h-12 text-center text-lg font-display text-gold bg-castle-surface border border-castle-border rounded-lg focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30 disabled:opacity-50 transition-colors"
                  />
                ))}
              </div>

              {/* Verify button */}
              <button
                onClick={handleVerifyClick}
                disabled={!codeFilled || status === 'verifying'}
                className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'verifying' ? (
                  <>
                    <div className="w-4 h-4 border-2 border-castle-bg/30 border-t-castle-bg rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    Enter the Library
                  </>
                )}
              </button>

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
                We&apos;ll send a login code to your inbox
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