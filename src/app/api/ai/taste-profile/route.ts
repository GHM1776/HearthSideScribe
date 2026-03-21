import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // Fetch full reading history
    const { data: userBooks, error: booksError } = await supabase
      .from('user_books')
      .select('*, book:books(*)')
      .eq('user_id', userId)
      .order('date_added', { ascending: true }); // oldest first — important for weighting

    if (booksError || !userBooks) {
      return NextResponse.json({ error: 'Failed to fetch books' }, { status: 500 });
    }

    const readBooks = userBooks.filter(
      (ub) => ub.status === 'read' || ub.status === 'would_reread'
    );

    if (readBooks.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'No read books yet' });
    }

    // Split into older history vs recent (last 5 books)
    const recentCutoff = Math.max(0, readBooks.length - 5);
    const olderBooks = readBooks.slice(0, recentCutoff);
    const recentBooks = readBooks.slice(recentCutoff);

    const formatBook = (ub: any) =>
      `"${ub.book?.title}" by ${ub.book?.author || 'Unknown'}` +
      (ub.rating ? ` — rated ${ub.rating}/5` : '') +
      (ub.status === 'would_reread' ? ' (would re-read)' : '') +
      (ub.hot_take ? ` | take: "${ub.hot_take}"` : '');

    const olderList = olderBooks.length > 0
      ? olderBooks.map(formatBook).join('\n')
      : 'None yet';

    const recentList = recentBooks.map(formatBook).join('\n');

    // Fetch existing profile for context
    const { data: existingProfile } = await supabase
      .from('taste_profiles')
      .select('profile_json')
      .eq('user_id', userId)
      .maybeSingle();

    const existingSummary = existingProfile?.profile_json
      ? `\nEXISTING PROFILE SUMMARY (for reference):\n${JSON.stringify(existingProfile.profile_json, null, 2)}`
      : '';

    const prompt = `Update this reader's taste profile based on their FULL reading history.

OLDER READING HISTORY (established patterns — weight these heavily):
${olderList}

RECENT READS — last 5 books (may reflect a temporary phase, NOT necessarily a permanent preference):
${recentList}
${existingSummary}

IMPORTANT INSTRUCTIONS:
- Base the profile on LONG-TERM patterns across the full history, not just recent reads
- If recent books cluster heavily in one genre (e.g. 4 biographies in a row), note it as a "current phase" in surprise_likes but do NOT make that genre dominate top_genres unless it also appears strongly in the older history
- Look for consistent themes and authors across ALL books, not just recent ones
- A genre appearing in 2 of the last 5 books should NOT override a genre appearing in 10 of 20 older books
- Ratings matter: a 5-star book from 2 years ago should influence recommendations more than a 3-star book from last week

Return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "top_genres": ["3-5 genres that appear consistently across their FULL history"],
  "avoids": ["3-5 things to avoid — based on DNF patterns, low ratings, or stated preferences"],
  "themes_loved": ["4-6 themes or story elements that appear repeatedly across all their books"],
  "favorite_authors": ["authors they've rated highly or read multiple times"],
  "reading_pace": "light or moderate or ambitious",
  "rating_tendency": "generous or balanced or critical",
  "current_phase": "one sentence about what they seem to be reading a lot of RIGHT NOW — may be temporary",
  "surprise_likes": "one sentence about unexpected patterns in their overall taste",
  "summary": "2-3 sentence portrait of this reader based on their FULL history — warm, specific, honest"
}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey || apiKey === 'sk-ant-your-key-here') {
      console.log('[taste-profile] No API key — skipping regeneration');
      return NextResponse.json({ skipped: true, reason: 'No API key' });
    }

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
        system: 'You are a literary analyst. Return only valid JSON with no markdown, no backticks, no preamble.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('[taste-profile] Claude API error:', response.status);
      return NextResponse.json({ error: 'AI error' }, { status: 500 });
    }

    const aiData = await response.json();
    const text = (aiData.content?.[0]?.text || '').trim();

    let profileData: Record<string, unknown>;
    try {
      profileData = JSON.parse(text);
    } catch {
      console.error('[taste-profile] Failed to parse JSON:', text.slice(0, 200));
      return NextResponse.json({ error: 'Failed to parse profile' }, { status: 500 });
    }

    const { error: saveError } = await supabase
      .from('taste_profiles')
      .upsert(
        {
          user_id: userId,
          profile_json: profileData,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (saveError) {
      console.error('[taste-profile] Save error:', saveError.message);
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 });
    }

    console.log(`[taste-profile] Updated for user ${userId} — ${readBooks.length} books analyzed`);
    return NextResponse.json({ success: true, booksAnalyzed: readBooks.length });
  } catch (err) {
    console.error('[taste-profile] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}