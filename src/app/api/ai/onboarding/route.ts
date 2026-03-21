import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface BookInput {
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
}

async function upsertBook(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  book: BookInput
): Promise<string | null> {
  if (book.isbn) {
    const { data } = await supabase
      .from('books')
      .select('id')
      .eq('isbn', book.isbn)
      .maybeSingle();
    if (data) return data.id;
  }

  if (book.author) {
    const { data } = await supabase
      .from('books')
      .select('id')
      .ilike('title', book.title)
      .ilike('author', book.author)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from('books')
    .insert({
      title: book.title,
      author: book.author,
      cover_url: book.cover_url,
      isbn: book.isbn,
      genres: book.genres || [],
      synopsis: book.synopsis,
      page_count: book.page_count,
      publish_year: book.publish_year,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[onboarding] Failed to insert book "${book.title}":`, error.message);
    return null;
  }

  return data.id;
}

async function addToShelf(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  bookId: string,
  status: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('user_books')
    .select('id')
    .eq('user_id', userId)
    .eq('book_id', bookId)
    .maybeSingle();

  if (existing) {
    console.log(`[onboarding] Book ${bookId} already on shelf for user ${userId}, skipping`);
    return;
  }

  const { error } = await supabase.from('user_books').insert({
    user_id: userId,
    book_id: bookId,
    status,
    date_added: new Date().toISOString(),
    ...(status === 'read' ? { date_finished: new Date().toISOString() } : {}),
  });

  if (error) {
    console.error(`[onboarding] Failed to add book ${bookId} to shelf:`, error.message);
  } else {
    console.log(`[onboarding] Added book ${bookId} to shelf with status "${status}"`);
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const body = await request.json();
    const { userId, favoriteBook, compellingText, dnfBooks, recentBooks, avoidsText } = body;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !userRecord) {
      console.error('[onboarding] User not found:', userId, userError?.message);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log(`[onboarding] Starting for user ${userId}`);

    // ── 1. Save favorite book → would_reread ──────────────────
    if (favoriteBook) {
      const bookId = await upsertBook(supabase, favoriteBook);
      if (bookId) {
        await addToShelf(supabase, userId, bookId, 'would_reread');
      }
    }

    // ── 2. Save recent enjoyed books → read ───────────────────
    for (const book of (recentBooks || [])) {
      const bookId = await upsertBook(supabase, book);
      if (bookId) {
        await addToShelf(supabase, userId, bookId, 'read');
      }
    }

    console.log(`[onboarding] Books saved. Generating taste profile...`);

    // ── 3. Build taste profile via Claude ─────────────────────
    const likedBookList = [
      favoriteBook
        ? `"${favoriteBook.title}" by ${favoriteBook.author || 'Unknown'} (ALL-TIME FAVORITE)`
        : null,
      ...(recentBooks || []).map(
        (b: BookInput) => `"${b.title}" by ${b.author || 'Unknown'}`
      ),
    ]
      .filter(Boolean)
      .join('\n');

    const dnfList =
      (dnfBooks || []).length > 0
        ? (dnfBooks as BookInput[]).map((b) => `"${b.title}" by ${b.author || 'Unknown'}`).join('\n')
        : 'None provided';

    const prompt = `Analyze this reader's taste and return a JSON object.

BOOKS THEY LOVE:
${likedBookList}

BOOKS THEY COULDN'T FINISH (avoid recommending similar):
${dnfList}

WHAT MAKES A BOOK COMPELLING TO THEM:
${compellingText || 'Not provided'}

THINGS THEY WANT TO AVOID:
${avoidsText || 'Not provided'}

Return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "top_genres": ["3-5 genres they clearly love"],
  "avoids": ["3-5 specific things to avoid in recommendations"],
  "themes_loved": ["4-6 themes or story elements they gravitate toward"],
  "favorite_authors": ["authors from their liked books"],
  "reading_pace": "light or moderate or ambitious",
  "rating_tendency": "generous or balanced or critical",
  "surprise_likes": "one sentence about any unexpected pattern in their taste",
  "summary": "2-3 sentence portrait of this reader — warm, specific, insightful"
}`;

    let profileData: Record<string, unknown> = {
      top_genres: [],
      avoids: avoidsText ? [avoidsText] : [],
      themes_loved: [],
      favorite_authors: favoriteBook?.author ? [favoriteBook.author] : [],
      reading_pace: 'moderate',
      rating_tendency: 'balanced',
      surprise_likes: 'Profile generated without AI analysis.',
      summary: `A reader who enjoys ${favoriteBook?.title || 'great books'}.`,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey !== 'sk-ant-your-key-here') {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 800,
            system:
              'You are a literary analyst. Return only valid JSON with no markdown, no backticks, no preamble.',
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          const text = (aiData.content?.[0]?.text || '').trim();
          try {
            profileData = JSON.parse(text);
            console.log('[onboarding] Taste profile generated successfully');
          } catch {
            console.error('[onboarding] Failed to parse AI profile JSON:', text.slice(0, 200));
          }
        } else {
          console.error('[onboarding] Claude API error:', response.status);
        }
      } catch (err) {
        console.error('[onboarding] Claude API call failed:', err);
      }
    } else {
      console.log('[onboarding] No API key — using fallback profile');
    }

    // ── 4. Save taste profile ─────────────────────────────────
    const { error: profileError } = await supabase
      .from('taste_profiles')
      .upsert(
        {
          user_id: userId,
          profile_json: profileData,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (profileError) {
      console.error('[onboarding] Failed to save taste profile:', profileError.message);
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
    }

    // NOTE: Avatar generation is triggered client-side (needs browser cookies for RLS)
    console.log(`[onboarding] Complete for user ${userId}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[onboarding] Unexpected error:', error);
    return NextResponse.json({ error: 'Onboarding failed' }, { status: 500 });
  }
}