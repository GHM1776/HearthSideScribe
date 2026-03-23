export type BookStatus = 'read' | 'reading' | 'want_to_read' | 'would_reread';
export type PickStatus = 'voting' | 'selected' | 'reading' | 'completed';
export type SuggestionStatus = 'pending' | 'picked' | 'passed';

export interface User {
  id: string;
  auth_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
}

export interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
  created_at: string;
}

export interface UserBook {
  id: string;
  user_id: string;
  book_id: string;
  status: BookStatus;
  rating: number | null;
  hot_take: string | null;
  date_added: string;
  date_finished: string | null;
  book?: Book;
  user?: User;
}

export interface TasteProfile {
  id: string;
  user_id: string;
  profile_json: TasteProfileData;
  generated_at: string;
}

export interface TasteProfileData {
  top_genres: string[];
  avoids: string[];
  themes_loved: string[];
  favorite_authors: string[];
  reading_pace: string;
  rating_tendency: string;
  surprise_likes: string;
  summary: string;
}

export interface MonthlyPick {
  id: string;
  month: number;
  year: number;
  // 5 pick slots (legacy column names for first 3, new for 4-5)
  fresh_pick: string | null;
  reread_pick: string | null;
  wildcard_pick: string | null;
  pick_4: string | null;
  pick_5: string | null;
  // Owliver's fun labels keyed by slot index 0-4
  pick_labels: Record<string, string>;
  selected_book: string | null;
  // Legacy single-vote columns (kept for backward compat)
  greg_vote: string | null;
  mati_vote: string | null;
  // Ranked voting: ordered arrays of 3 book IDs [1st, 2nd, 3rd]
  greg_votes: string[];
  mati_votes: string[];
  ai_reasoning: string | null;
  ai_tiebreak_reasoning: string | null;
  status: PickStatus;
  regeneration_count: number;
  created_at: string;
  // Joined book data (optional, populated by queries)
  fresh_pick_book?: Book;
  reread_pick_book?: Book;
  wildcard_pick_book?: Book;
  pick_4_book?: Book;
  pick_5_book?: Book;
  selected_book_data?: Book;
}

// Helper to get all 5 pick IDs from a MonthlyPick row
export function getPickSlots(pick: MonthlyPick): (string | null)[] {
  return [pick.fresh_pick, pick.reread_pick, pick.wildcard_pick, pick.pick_4, pick.pick_5];
}

// Pick slot column names in order
export const PICK_COLUMNS = ['fresh_pick', 'reread_pick', 'wildcard_pick', 'pick_4', 'pick_5'] as const;

export interface Suggestion {
  id: string;
  user_id: string;
  book_id: string;
  reason: string | null;
  status: SuggestionStatus;
  month_used: number | null;
  year_used: number | null;
  created_at: string;
  book?: Book;
  user?: User;
}

export interface WelcomeLog {
  id: string;
  user_id: string;
  message: string;
  generated_at: string;
}

export interface GoogleBooksResponse {
  totalItems: number;
  items?: GoogleBookItem[];
}

export interface GoogleBookItem {
  id: string;
  volumeInfo: {
    title: string;
    authors?: string[];
    description?: string;
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
    };
    categories?: string[];
    pageCount?: number;
    publishedDate?: string;
  };
}

export const STATUS_LABELS: Record<BookStatus, string> = {
  read: 'Read',
  reading: 'Currently Reading',
  want_to_read: 'Want to Read',
  would_reread: 'Would Re-Read',
};

export const STATUS_ICONS: Record<BookStatus, string> = {
  read: '\u2705',
  reading: '\uD83D\uDCD6',
  want_to_read: '\uD83D\uDD2E',
  would_reread: '\uD83D\uDD01',
};