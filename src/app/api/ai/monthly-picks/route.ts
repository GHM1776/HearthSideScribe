import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { RECOMMEND_SYSTEM_PROMPT, TIEBREAK_SYSTEM_PROMPT, MAX_REGENERATIONS, MONTHS } from '@/lib/constants';
import { PICK_COLUMNS } from '@/lib/types';

// ─── Types ───────────────────────────────────────────────────
interface PickResult {
  title: string;
  author: string;
  isbn?: string | null;
  pitch: string;
  pick_type: 'mati_lean' | 'greg_lean' | 'discovery';
  label: string;
}

interface UserBookRow {
  status: string;
  rating: number | null;
  hot_take: string | null;
  book: {
    id: string;
    title: string;
    author: string | null;
    isbn: string | null;
    genres: string[];
    cover_url: string | null;
    page_count: number | null;
    publish_year: number | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────
function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never)); }
          catch { /* server context */ }
        },
      },
    }
  );
}

async function callClaude(system: string, prompt: string, maxTokens = 2500): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') return null;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    console.error('Claude API error:', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  return data.content?.[0]?.text || null;
}

function formatBookList(books: UserBookRow[]): string {
  if (books.length === 0) return 'None yet';
  return books
    .map((ub) => {
      const rating = ub.rating ? ` (${ub.rating}/5)` : '';
      const take = ub.hot_take ? ` \u2014 "${ub.hot_take}"` : '';
      return `"${ub.book.title}" by ${ub.book.author}${rating}${take}`;
    })
    .join('\n');
}

async function searchGoogleBooks(query: string): Promise<{
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
} | null> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const params = new URLSearchParams({
    q: query,
    maxResults: '1',
    printType: 'books',
    langRestrict: 'en',
  });
  if (apiKey) params.set('key', apiKey);

  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    const v = item.volumeInfo;
    const isbn13 = v.industryIdentifiers?.find((id: { type: string }) => id.type === 'ISBN_13');
    const isbn10 = v.industryIdentifiers?.find((id: { type: string }) => id.type === 'ISBN_10');
    let coverUrl = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
    if (coverUrl) {
      coverUrl = coverUrl.replace('http://', 'https://').replace('zoom=1', 'zoom=2').replace('&edge=curl', '');
    }
    let publishYear: number | null = null;
    if (v.publishedDate) {
      const m = v.publishedDate.match(/^(\d{4})/);
      if (m) publishYear = parseInt(m[1]);
    }

    return {
      title: v.title,
      author: v.authors?.join(', ') || null,
      cover_url: coverUrl,
      isbn: isbn13?.identifier || isbn10?.identifier || null,
      genres: v.categories || [],
      synopsis: v.description || null,
      page_count: v.pageCount || null,
      publish_year: publishYear,
    };
  } catch {
    return null;
  }
}

async function upsertBook(supabase: ReturnType<typeof getSupabase>, bookData: {
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
}): Promise<string | null> {
  if (bookData.isbn) {
    const { data: existing } = await supabase
      .from('books').select('id').eq('isbn', bookData.isbn).maybeSingle();
    if (existing) return existing.id;
  }
  const { data: byTitle } = await supabase
    .from('books').select('id').ilike('title', bookData.title).maybeSingle();
  if (byTitle) return byTitle.id;

  const { data: inserted, error } = await supabase
    .from('books').insert(bookData).select('id').single();
  if (error) { console.error('Book insert error:', error); return null; }
  return inserted.id;
}

// Add the selected book to both users' shelves as "reading"
async function addBookToBothShelves(supabase: ReturnType<typeof getSupabase>, bookId: string) {
  const { data: users } = await supabase.from('users').select('id');
  if (!users) return;

  for (const user of users) {
    const { data: existing } = await supabase
      .from('user_books')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('book_id', bookId)
      .maybeSingle();

    if (existing) {
      // Update to reading if not already read
      if (existing.status !== 'read' && existing.status !== 'would_reread') {
        await supabase
          .from('user_books')
          .update({ status: 'reading' })
          .eq('id', existing.id);
      }
    } else {
      await supabase
        .from('user_books')
        .insert({
          user_id: user.id,
          book_id: bookId,
          status: 'reading',
          date_added: new Date().toISOString(),
        });
    }
  }
}

// Score ranked votes: 1st = 3pts, 2nd = 2pts, 3rd = 1pt
function scoreVotes(gregVotes: string[], matiVotes: string[], pickIds: string[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const id of pickIds) {
    scores[id] = 0;
  }
  const points = [3, 2, 1];
  for (let i = 0; i < gregVotes.length && i < 3; i++) {
    if (scores[gregVotes[i]] !== undefined) scores[gregVotes[i]] += points[i];
  }
  for (let i = 0; i < matiVotes.length && i < 3; i++) {
    if (scores[matiVotes[i]] !== undefined) scores[matiVotes[i]] += points[i];
  }
  return scores;
}

// ─── GET: Fetch current month's picks ────────────────────────
export async function GET() {
  const supabase = getSupabase();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: pick } = await supabase
    .from('monthly_picks')
    .select('*')
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  if (!pick) {
    return NextResponse.json({ pick: null, books: {} });
  }

  // Gather all book IDs from the 5 slots + selected
  const bookIds = [
    pick.fresh_pick, pick.reread_pick, pick.wildcard_pick,
    pick.pick_4, pick.pick_5, pick.selected_book,
  ].filter(Boolean);

  const books: Record<string, unknown> = {};
  if (bookIds.length > 0) {
    const { data: bookRows } = await supabase
      .from('books').select('*').in('id', bookIds);
    if (bookRows) {
      for (const b of bookRows) { books[b.id] = b; }
    }
  }

  return NextResponse.json({ pick, books });
}

// ─── POST: Generate picks, vote, or tiebreak ─────────────────
export async function POST(request: Request) {
  const supabase = getSupabase();
  const body = await request.json();
  const { action } = body;

  if (action === 'generate') return handleGenerate(supabase, body);
  if (action === 'vote') return handleVote(supabase, body);
  if (action === 'tiebreak') return handleTiebreak(supabase);

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// ─── Generate 5 Monthly Picks ────────────────────────────────
async function handleGenerate(supabase: ReturnType<typeof getSupabase>, body: { rejectedReason?: string }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: existing } = await supabase
    .from('monthly_picks')
    .select('id, regeneration_count, status')
    .eq('month', month).eq('year', year)
    .maybeSingle();

  const isNewCycle = existing?.status === 'completed';

  if (existing && !isNewCycle && existing.regeneration_count >= MAX_REGENERATIONS) {
    return NextResponse.json({ error: 'Maximum regenerations reached for this month' }, { status: 400 });
  }

  // 1. Gather all context
  const { data: users } = await supabase.from('users').select('id, name');
  const greg = users?.find((u) => u.name === 'Greg');
  const mati = users?.find((u) => u.name === 'Mati');

  if (!greg || !mati) {
    return NextResponse.json({ error: 'Both users must exist' }, { status: 400 });
  }

  const { data: gregBooks } = await supabase
    .from('user_books').select('*, book:books(*)').eq('user_id', greg.id) as { data: UserBookRow[] | null };
  const { data: matiBooks } = await supabase
    .from('user_books').select('*, book:books(*)').eq('user_id', mati.id) as { data: UserBookRow[] | null };

  const { data: profiles } = await supabase.from('taste_profiles').select('user_id, profile_json');
  const gregProfile = profiles?.find((p) => p.user_id === greg.id)?.profile_json;
  const matiProfile = profiles?.find((p) => p.user_id === mati.id)?.profile_json;

  const { data: pastPicks } = await supabase
    .from('monthly_picks')
    .select('fresh_pick, reread_pick, wildcard_pick, pick_4, pick_5')
    .neq('status', 'voting');

  const pastPickBookIds = (pastPicks || []).flatMap((p) =>
    [p.fresh_pick, p.reread_pick, p.wildcard_pick, p.pick_4, p.pick_5].filter(Boolean)
  );

  let pastPickTitles: string[] = [];
  if (pastPickBookIds.length > 0) {
    const { data: pastBooks } = await supabase.from('books').select('title').in('id', pastPickBookIds);
    pastPickTitles = (pastBooks || []).map((b) => `"${b.title}"`);
  }

  const { data: suggestions } = await supabase
    .from('suggestions').select('*, book:books(*)').eq('status', 'pending');

  const suggestionsText = (suggestions || []).map((s) => {
    const bookObj = Array.isArray(s.book) ? s.book[0] : s.book;
    if (!bookObj) return null;
    return `"${bookObj.title}" by ${bookObj.author}${s.reason ? ` \u2014 "${s.reason}"` : ''}`;
  }).filter(Boolean).join('\n') || 'None';

  // 2. Build Claude prompt
  const gregRead = (gregBooks || []).filter((ub) => ub.status === 'read' || ub.status === 'would_reread');
  const matiRead = (matiBooks || []).filter((ub) => ub.status === 'read' || ub.status === 'would_reread');

  const prompt = `Generate 5 book recommendations for ${MONTHS[month - 1]} ${year}.

== GREG'S TASTE PROFILE ==
${gregProfile ? JSON.stringify(gregProfile, null, 2) : 'Not yet generated'}

== GREG'S READING HISTORY (${gregRead.length} books read) ==
${formatBookList(gregRead)}

== MATI'S TASTE PROFILE ==
${matiProfile ? JSON.stringify(matiProfile, null, 2) : 'Not yet generated'}

== MATI'S READING HISTORY (${matiRead.length} books read) ==
${formatBookList(matiRead)}

== PAST MONTHLY PICKS (do NOT repeat these) ==
${pastPickTitles.length > 0 ? pastPickTitles.join(', ') : 'None yet'}

== USER SUGGESTIONS TO CONSIDER ==
${suggestionsText}

${body.rejectedReason ? `== PREVIOUS PICKS WERE REJECTED ==\nReason: ${body.rejectedReason}\nGo in a different direction this time.\n` : ''}
Remember: 5 picks total. 1 leaning Mati, 1 leaning Greg, 3 discovery picks. ALL must be new to both readers. Give each pick a fun, creative label.

Return ONLY a valid JSON object (no markdown, no backticks) with this structure:
{
  "picks": [
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "mati_lean", "label": "Your fun creative title" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "greg_lean", "label": "Your fun creative title" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "discovery", "label": "Your fun creative title" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "discovery", "label": "Your fun creative title" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "discovery", "label": "Your fun creative title" }
  ],
  "reasoning": "1-2 sentence overview of why these 5 books work together as a set"
}`;

  const claudeResponse = await callClaude(
    RECOMMEND_SYSTEM_PROMPT + '\nReturn only valid JSON with no markdown or backticks.',
    prompt,
    3000
  );

  if (!claudeResponse) {
    return NextResponse.json({ error: 'AI recommendation failed' }, { status: 500 });
  }

  let parsed: { picks: PickResult[]; reasoning: string };
  try {
    const cleaned = claudeResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('Failed to parse Claude response:', claudeResponse);
    return NextResponse.json({ error: 'Failed to parse AI recommendations' }, { status: 500 });
  }

  if (!parsed.picks || parsed.picks.length < 5) {
    return NextResponse.json({ error: 'AI returned incomplete picks (need 5)' }, { status: 500 });
  }

  // 3. Validate each pick via Google Books and store in DB
  const bookIds: (string | null)[] = [];
  const labels: Record<string, string> = {};

  for (let i = 0; i < 5; i++) {
    const pick = parsed.picks[i];
    labels[String(i)] = pick.label;

    // Check if already in DB
    const { data: existingBook } = await supabase
      .from('books').select('id').ilike('title', pick.title).maybeSingle();

    if (existingBook) {
      bookIds.push(existingBook.id);
      continue;
    }

    // Search Google Books for validation + cover art
    const googleResult = await searchGoogleBooks(`${pick.title} ${pick.author}`);
    const bookData = googleResult || {
      title: pick.title,
      author: pick.author,
      cover_url: null,
      isbn: pick.isbn || null,
      genres: [],
      synopsis: null,
      page_count: null,
      publish_year: null,
    };
    const bookId = await upsertBook(supabase, bookData);
    bookIds.push(bookId);
  }

  // 4. Upsert the monthly pick record
  const pickData = {
    month,
    year,
    fresh_pick: bookIds[0] || null,
    reread_pick: bookIds[1] || null,
    wildcard_pick: bookIds[2] || null,
    pick_4: bookIds[3] || null,
    pick_5: bookIds[4] || null,
    pick_labels: labels,
    selected_book: null,
    greg_vote: null,
    mati_vote: null,
    greg_votes: [],
    mati_votes: [],
    ai_reasoning: parsed.reasoning + '\n\n' + parsed.picks.map((p) => `**${p.label}:** ${p.pitch}`).join('\n\n'),
    ai_tiebreak_reasoning: null,
    status: 'voting' as const,
    regeneration_count: (existing && !isNewCycle) ? existing.regeneration_count + 1 : 0,
  };

  if (existing) {
    await supabase.from('monthly_picks').update(pickData).eq('id', existing.id);
  } else {
    await supabase.from('monthly_picks').insert(pickData);
  }

  return NextResponse.json({ success: true });
}

// ─── Ranked Vote ─────────────────────────────────────────────
async function handleVote(supabase: ReturnType<typeof getSupabase>, body: { userId: string; votes: string[] }) {
  const { userId, votes } = body;

  if (!votes || !Array.isArray(votes) || votes.length !== 3) {
    return NextResponse.json({ error: 'Must rank exactly 3 picks' }, { status: 400 });
  }

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: user } = await supabase
    .from('users').select('name').eq('id', userId).single();
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const votesColumn = user.name === 'Greg' ? 'greg_votes' : 'mati_votes';

  const { error } = await supabase
    .from('monthly_picks')
    .update({ [votesColumn]: votes })
    .eq('month', month).eq('year', year);

  if (error) return NextResponse.json({ error: 'Vote failed' }, { status: 500 });

  // Check if both have voted
  const { data: pick } = await supabase
    .from('monthly_picks')
    .select('*')
    .eq('month', month).eq('year', year)
    .single();

  if (!pick) return NextResponse.json({ error: 'Pick not found' }, { status: 404 });

  const gregVotes = pick.greg_votes as string[] || [];
  const matiVotes = pick.mati_votes as string[] || [];

  if (gregVotes.length === 3 && matiVotes.length === 3) {
    // Both voted \u2014 calculate scores
    const allPickIds = [
      pick.fresh_pick, pick.reread_pick, pick.wildcard_pick,
      pick.pick_4, pick.pick_5,
    ].filter(Boolean) as string[];

    const scores = scoreVotes(gregVotes, matiVotes, allPickIds);

    // Find the winner(s)
    const maxScore = Math.max(...Object.values(scores));
    const winners = Object.entries(scores).filter(([, s]) => s === maxScore);

    if (winners.length === 1) {
      // Clear winner
      const winnerId = winners[0][0];
      await supabase
        .from('monthly_picks')
        .update({ selected_book: winnerId, status: 'reading' })
        .eq('month', month).eq('year', year);

      // Auto-add to both users' shelves as "reading"
      await addBookToBothShelves(supabase, winnerId);

      return NextResponse.json({ success: true, resolved: true, selectedBook: winnerId });
    } else {
      // Tie \u2014 needs tiebreak
      return NextResponse.json({
        success: true,
        resolved: false,
        needsTiebreak: true,
        scores,
        tiedBooks: winners.map(([id]) => id),
      });
    }
  }

  // Only one person has voted so far
  return NextResponse.json({ success: true, voted: true, waitingForPartner: true });
}

// ─── AI Tiebreak ─────────────────────────────────────────────
async function handleTiebreak(supabase: ReturnType<typeof getSupabase>) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: pick } = await supabase
    .from('monthly_picks').select('*').eq('month', month).eq('year', year).single();

  if (!pick) return NextResponse.json({ error: 'No picks found' }, { status: 404 });

  const gregVotes = pick.greg_votes as string[] || [];
  const matiVotes = pick.mati_votes as string[] || [];

  if (gregVotes.length < 3 || matiVotes.length < 3) {
    return NextResponse.json({ error: 'Both votes needed for tiebreak' }, { status: 400 });
  }

  const allPickIds = [
    pick.fresh_pick, pick.reread_pick, pick.wildcard_pick,
    pick.pick_4, pick.pick_5,
  ].filter(Boolean) as string[];

  const scores = scoreVotes(gregVotes, matiVotes, allPickIds);
  const maxScore = Math.max(...Object.values(scores));
  const tiedIds = Object.entries(scores).filter(([, s]) => s === maxScore).map(([id]) => id);

  // Fetch tied books
  const { data: tiedBooks } = await supabase
    .from('books').select('*').in('id', tiedIds);

  // Fetch taste profiles
  const { data: profiles } = await supabase.from('taste_profiles').select('user_id, profile_json');
  const { data: users } = await supabase.from('users').select('id, name');
  const greg = users?.find((u) => u.name === 'Greg');
  const mati = users?.find((u) => u.name === 'Mati');
  const gregProfile = profiles?.find((p) => p.user_id === greg?.id)?.profile_json;
  const matiProfile = profiles?.find((p) => p.user_id === mati?.id)?.profile_json;

  const labels = (pick.pick_labels || {}) as Record<string, string>;

  const tiedBooksInfo = (tiedBooks || []).map((b) => {
    const idx = allPickIds.indexOf(b.id);
    return `"${b.title}" by ${b.author} (label: "${labels[String(idx)] || 'Pick ' + (idx + 1)}", score: ${scores[b.id]})`;
  }).join('\n');

  const prompt = `Break this tie for ${MONTHS[month - 1]} ${year}:

Tied books (all scored ${maxScore} points):
${tiedBooksInfo}

Greg's ranked votes: ${gregVotes.map((id, i) => {
    const idx = allPickIds.indexOf(id);
    return `#${i + 1}: Pick ${idx + 1}`;
  }).join(', ')}
Mati's ranked votes: ${matiVotes.map((id, i) => {
    const idx = allPickIds.indexOf(id);
    return `#${i + 1}: Pick ${idx + 1}`;
  }).join(', ')}

Greg's taste profile: ${JSON.stringify(gregProfile || {})}
Mati's taste profile: ${JSON.stringify(matiProfile || {})}

Which book should be this month's read? Return ONLY valid JSON:
{ "winner_index": <index 0-4 of the winning pick slot>, "reasoning": "your warm, fair explanation with one owl pun" }`;

  const claudeResponse = await callClaude(TIEBREAK_SYSTEM_PROMPT, prompt, 500);

  let winnerId = tiedIds[0]; // fallback
  let reasoning = 'The owl flipped a coin (AI tiebreak unavailable).';

  if (claudeResponse) {
    try {
      const cleaned = claudeResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const result = JSON.parse(cleaned);
      const winnerIdx = result.winner_index;
      if (typeof winnerIdx === 'number' && allPickIds[winnerIdx]) {
        winnerId = allPickIds[winnerIdx];
      }
      if (result.reasoning) reasoning = result.reasoning;
    } catch {
      console.error('Tiebreak parse error:', claudeResponse);
    }
  }

  // Set winner and status to reading
  await supabase
    .from('monthly_picks')
    .update({
      selected_book: winnerId,
      ai_tiebreak_reasoning: reasoning,
      status: 'reading',
    })
    .eq('month', month).eq('year', year);

  // Auto-add to both users' shelves
  await addBookToBothShelves(supabase, winnerId);

  return NextResponse.json({ success: true, winnerId, reasoning });
}