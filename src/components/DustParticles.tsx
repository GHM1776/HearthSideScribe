'use client';

import { useEffect, useState } from 'react';

interface Particle {
  id: number;
  left: string;
  bottom: string;
  size: number;
  duration: string;
  delay: string;
}

export default function DustParticles() {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const generated: Particle[] = [];
    for (let i = 0; i < 20; i++) {
      generated.push({
        id: i,
        left: `${10 + Math.random() * 80}%`,
        bottom: `${Math.random() * 30}%`,
        size: 1 + Math.random() * 2.5,
        duration: `${8 + Math.random() * 12}s`,
        delay: `${Math.random() * 10}s`,
      });
    }
    setParticles(generated);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 3 }} aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="dust-particle"
          style={{
            left: p.left,
            bottom: p.bottom,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDuration: p.duration,
            animationDelay: p.delay,
          }}
        />
      ))}
    </div>
  );
}
