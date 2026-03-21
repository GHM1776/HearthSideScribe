'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { User, LogOut, BookOpen, Star, Loader2, Heart, Ban } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { useBooks } from '@/hooks/useBooks';
import { createClient } from '@/lib/supabase/client';
import BottomNav from '@/components/BottomNav';
import { GENRE_COLORS } from '@/lib/constants';
import type { TasteProfileData } from '@/lib/types';

const OWL = '\u{1F989}';

export default function ProfilePage() {
  const { user, isLoading: userLoading } = useUser();
  const { userBooks } = useBooks(user?.id);
  const router = useRouter();
  const [profile, setProfile] = useState<TasteProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Fetch taste profile
  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('taste_profiles')
      .select('profile_json')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data?.profile_json) {
      setProfile(data.profile_json as TasteProfileData);
    }
    setProfileLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('bookclub-entered');
    sessionStorage.removeItem('bookclub-onboarded');
    router.push('/login');
  };

  // Reading stats
  const totalBooks = userBooks.length;
  const readCount = userBooks.filter((ub) => ub.status === 'read' || ub.status === 'would_reread').length;
  const readingCount = userBooks.filter((ub) => ub.status === 'reading').length;
  const wantCount = userBooks.filter((ub) => ub.status === 'want_to_read').length;
  const ratedBooks = userBooks.filter((ub) => ub.rating);
  const avgRating = ratedBooks.length > 0
    ? (ratedBooks.reduce((sum, ub) => sum + (ub.rating || 0), 0) / ratedBooks.length).toFixed(1)
    : null;

  const hasAvatar = user?.avatar_url && user.avatar_url.startsWith('data:image/');

  if (userLoading) {
    return (
      <div className="page-container flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-4xl animate-pulse">{OWL}</div>
          <p className="font-body text-parchment/40 text-sm italic">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-lg mx-auto space-y-6">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="candle-glow pt-2 text-center"
      >
        <h1 className="font-display text-gold text-xl text-glow tracking-wider">Profile</h1>
      </motion.header>

      {/* User card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="castle-card p-6 text-center space-y-4"
      >
        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-gold/30 mx-auto shadow-lg shadow-black/30">
          {hasAvatar ? (
            <img
              src={user!.avatar_url!}
              alt={`${user!.name}'s avatar`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gold/10 flex items-center justify-center">
              <User size={36} className="text-gold" />
            </div>
          )}
        </div>
        <div>
          <p className="font-display text-gold text-xl">{user?.name}</p>
          <p className="font-body text-parchment/50 text-sm">{user?.email}</p>
        </div>
      </motion.div>

      {/* Reading stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="castle-card p-5"
      >
        <h2 className="section-heading mb-4 flex items-center gap-2">
          <BookOpen size={18} className="text-gold" />
          Reading Stats
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <StatBlock label="Books Read" value={readCount} />
          <StatBlock label="Currently Reading" value={readingCount} />
          <StatBlock label="Want to Read" value={wantCount} />
          <StatBlock label="Avg Rating" value={avgRating || '\u2014'} />
        </div>
        <div className="mt-3 pt-3 border-t border-castle-border">
          <p className="font-body text-parchment/40 text-xs text-center">
            {totalBooks} total books on your shelf
          </p>
        </div>
      </motion.div>

      {/* Taste Profile */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="castle-card p-5 space-y-5"
      >
        <h2 className="section-heading flex items-center gap-2">
          <span className="text-lg">{OWL}</span>
          Taste Profile
        </h2>

        {profileLoading ? (
          <div className="py-8 text-center">
            <Loader2 size={20} className="text-gold/40 animate-spin mx-auto" />
          </div>
        ) : profile ? (
          <div className="space-y-5">
            {/* Summary */}
            <div className="bg-gold/5 rounded-lg p-4 border border-gold/10">
              <p className="font-body text-parchment/80 text-sm leading-relaxed italic">
                &ldquo;{profile.summary}&rdquo;
              </p>
            </div>

            {/* Top Genres */}
            {profile.top_genres && profile.top_genres.length > 0 && (
              <div>
                <p className="font-display text-parchment/60 text-xs uppercase tracking-wider mb-2">Top Genres</p>
                <div className="flex flex-wrap gap-2">
                  {profile.top_genres.map((genre) => {
                    const color = GENRE_COLORS[genre.toLowerCase()] || GENRE_COLORS.default;
                    return (
                      <span
                        key={genre}
                        className="px-3 py-1.5 rounded-full text-xs font-ui"
                        style={{
                          backgroundColor: `${color}20`,
                          color: color,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        {genre}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Themes Loved */}
            {profile.themes_loved && profile.themes_loved.length > 0 && (
              <div>
                <p className="font-display text-parchment/60 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Heart size={12} />
                  Themes You Love
                </p>
                <div className="flex flex-wrap gap-2">
                  {profile.themes_loved.map((theme) => (
                    <span
                      key={theme}
                      className="px-2.5 py-1 rounded-lg text-xs font-body text-parchment/70 bg-castle-surface-light border border-castle-border"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Avoids */}
            {profile.avoids && profile.avoids.length > 0 && (
              <div>
                <p className="font-display text-parchment/60 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Ban size={12} />
                  Things to Avoid
                </p>
                <div className="flex flex-wrap gap-2">
                  {profile.avoids.map((item) => (
                    <span
                      key={item}
                      className="px-2.5 py-1 rounded-lg text-xs font-body text-crimson-light/70 bg-crimson/10 border border-crimson/20"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Favorite Authors */}
            {profile.favorite_authors && profile.favorite_authors.length > 0 && (
              <div>
                <p className="font-display text-parchment/60 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Star size={12} />
                  Favorite Authors
                </p>
                <p className="font-body text-parchment/70 text-sm">
                  {profile.favorite_authors.join(', ')}
                </p>
              </div>
            )}

            {/* Reading pace + tendency */}
            <div className="flex gap-4">
              {profile.reading_pace && (
                <div className="flex-1 bg-castle-surface-light rounded-lg p-3 text-center">
                  <p className="font-ui text-[10px] text-parchment/40 uppercase tracking-wider">Pace</p>
                  <p className="font-display text-gold text-sm mt-1 capitalize">{profile.reading_pace}</p>
                </div>
              )}
              {profile.rating_tendency && (
                <div className="flex-1 bg-castle-surface-light rounded-lg p-3 text-center">
                  <p className="font-ui text-[10px] text-parchment/40 uppercase tracking-wider">Rating Style</p>
                  <p className="font-display text-gold text-sm mt-1 capitalize">{profile.rating_tendency}</p>
                </div>
              )}
            </div>

            {/* Surprise likes */}
            {profile.surprise_likes && (
              <div className="bg-castle-surface-light rounded-lg p-3">
                <p className="font-ui text-[10px] text-parchment/40 uppercase tracking-wider mb-1">Hidden Pattern</p>
                <p className="font-body text-parchment/60 text-sm">{profile.surprise_likes}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="font-body text-parchment/40 text-sm">
              Your taste profile will appear here once you&apos;ve added some books to your shelf.
            </p>
          </div>
        )}

        <p className="font-body text-parchment/20 text-[11px] text-center italic">
          Updated automatically as you read
        </p>
      </motion.div>

      {/* Sign out */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={handleSignOut}
        className="btn-ghost w-full flex items-center justify-center gap-2 text-crimson-light border-crimson/30"
      >
        <LogOut size={16} />
        Leave the Tower
      </motion.button>

      <BottomNav />
    </div>
  );
}

// ─── Stat Block Component ────────────────────────────────────
function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="font-display text-gold text-2xl">{value}</p>
      <p className="font-body text-parchment/40 text-xs mt-0.5">{label}</p>
    </div>
  );
}