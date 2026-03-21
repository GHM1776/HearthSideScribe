'use client';

import { useEffect, useState } from 'react';

interface Raindrop {
  id: number;
  left: string;
  duration: string;
  delay: string;
  opacity: number;
}

export default function RainEffect() {
  const [drops, setDrops] = useState<Raindrop[]>([]);

  useEffect(() => {
    const generated: Raindrop[] = [];
    const count = 60;

    for (let i = 0; i < count; i++) {
      let left: number;
      const rand = Math.random();
      if (rand < 0.35) {
        left = Math.random() * 15;
      } else if (rand < 0.7) {
        left = 85 + Math.random() * 15;
      } else {
        left = 15 + Math.random() * 70;
      }

      generated.push({
        id: i,
        left: `${left}%`,
        duration: `${0.8 + Math.random() * 0.6}s`,
        delay: `${Math.random() * 3}s`,
        opacity: 0.2 + Math.random() * 0.4,
      });
    }
    setDrops(generated);
  }, []);

  return (
    <div className="rain-container" aria-hidden="true">
      {drops.map((drop) => (
        <div
          key={drop.id}
          className="raindrop"
          style={{
            left: drop.left,
            animationDuration: drop.duration,
            animationDelay: drop.delay,
            opacity: drop.opacity,
          }}
        />
      ))}
    </div>
  );
}
