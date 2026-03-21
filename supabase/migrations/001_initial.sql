-- ============================================
-- HearthsideScribe â€” Initial Schema
-- Run this in the Supabase SQL Editor
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS
CREATE TABLE public.users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id    UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  phone      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- BOOKS
CREATE TABLE public.books (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        TEXT NOT NULL,
  author       TEXT,
  cover_url    TEXT,
  isbn         TEXT,
  genres       TEXT[] DEFAULT '{}',
  synopsis     TEXT,
  page_count   INT,
  publish_year INT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- USER_BOOKS
CREATE TABLE public.user_books (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_id       UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('read', 'reading', 'want_to_read', 'would_reread')),
  rating        INT CHECK (rating BETWEEN 1 AND 5),
  hot_take      TEXT,
  date_added    TIMESTAMPTZ DEFAULT NOW(),
  date_finished TIMESTAMPTZ,
  UNIQUE(user_id, book_id)
);

-- TASTE PROFILES
CREATE TABLE public.taste_profiles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_json JSONB DEFAULT '{}',
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MONTHLY PICKS
CREATE TABLE public.monthly_picks (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  month                 INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  year                  INT NOT NULL,
  fresh_pick            UUID REFERENCES public.books(id),
  reread_pick           UUID REFERENCES public.books(id),
  wildcard_pick         UUID REFERENCES public.books(id),
  selected_book         UUID REFERENCES public.books(id),
  greg_vote             UUID REFERENCES public.books(id),
  mati_vote             UUID REFERENCES public.books(id),
  ai_reasoning          TEXT,
  ai_tiebreak_reasoning TEXT,
  status                TEXT DEFAULT 'voting' CHECK (status IN ('voting', 'selected', 'reading', 'completed')),
  regeneration_count    INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, year)
);

-- SUGGESTIONS
CREATE TABLE public.suggestions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_id    UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  reason     TEXT,
  status     TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'picked', 'passed')),
  month_used INT,
  year_used  INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WELCOME LOG
CREATE TABLE public.welcome_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_user_books_user ON public.user_books(user_id);
CREATE INDEX idx_user_books_book ON public.user_books(book_id);
CREATE INDEX idx_user_books_status ON public.user_books(status);
CREATE INDEX idx_monthly_picks_date ON public.monthly_picks(year, month);
CREATE INDEX idx_suggestions_status ON public.suggestions(status);
CREATE INDEX idx_welcome_log_user ON public.welcome_log(user_id);
CREATE INDEX idx_books_isbn ON public.books(isbn);

-- ENABLE RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taste_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.welcome_log ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
CREATE POLICY "Users can view all club members" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (auth_id = auth.uid());

CREATE POLICY "Anyone can view books" ON public.books FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can add books" ON public.books FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update books" ON public.books FOR UPDATE TO authenticated USING (true);

CREATE POLICY "View all user-book relationships" ON public.user_books FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage own user-book relationships" ON public.user_books FOR INSERT TO authenticated WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
CREATE POLICY "Update own user-book relationships" ON public.user_books FOR UPDATE TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
CREATE POLICY "Delete own user-book relationships" ON public.user_books FOR DELETE TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "View all taste profiles" ON public.taste_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can manage taste profiles" ON public.taste_profiles FOR ALL TO authenticated USING (true);

CREATE POLICY "View monthly picks" ON public.monthly_picks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage monthly picks" ON public.monthly_picks FOR ALL TO authenticated USING (true);

CREATE POLICY "View all suggestions" ON public.suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Add own suggestions" ON public.suggestions FOR INSERT TO authenticated WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
CREATE POLICY "Manage suggestions" ON public.suggestions FOR UPDATE TO authenticated USING (true);

CREATE POLICY "View own welcome log" ON public.welcome_log FOR SELECT TO authenticated USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
CREATE POLICY "Insert welcome log" ON public.welcome_log FOR INSERT TO authenticated WITH CHECK (true);

-- HELPER FUNCTION
CREATE OR REPLACE FUNCTION public.get_my_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
