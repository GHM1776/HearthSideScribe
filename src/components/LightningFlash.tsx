'use client';

import { useEffect, useRef, useCallback } from 'react';

export default function LightningFlash() {
  const overlayRef = useRef<HTMLDivElement>(null);

  const triggerFlash = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;

    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');

    const nextDelay = 20000 + Math.random() * 40000;
    setTimeout(triggerFlash, nextDelay);
  }, []);

  useEffect(() => {
    const initialDelay = 10000 + Math.random() * 20000;
    const timer = setTimeout(triggerFlash, initialDelay);
    return () => clearTimeout(timer);
  }, [triggerFlash]);

  return (
    <div ref={overlayRef} className="lightning-overlay" aria-hidden="true" />
  );
}
