'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

interface RatingStarsProps {
  rating: number | null;
  onRate?: (rating: number) => void;
  size?: number;
  interactive?: boolean;
}

export default function RatingStars({
  rating,
  onRate,
  size = 24,
  interactive = true,
}: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayRating = hovered ?? rating ?? 0;

  return (
    <div className="flex gap-0.5" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= displayRating;
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => {
              if (interactive && onRate) {
                onRate(star === rating ? 0 : star);
              }
            }}
            onMouseEnter={() => interactive && setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            className={`transition-all duration-150 ${
              interactive ? 'cursor-pointer active:scale-125' : 'cursor-default'
            }`}
            aria-label={`${star} star${star !== 1 ? 's' : ''}`}
          >
            <Star
              size={size}
              fill={filled ? '#D4A847' : 'transparent'}
              color={filled ? '#D4A847' : '#3A2D32'}
              strokeWidth={1.5}
              className={`transition-colors duration-150 ${
                filled ? 'drop-shadow-[0_0_4px_rgba(196,153,59,0.4)]' : ''
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}