import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { RECOMMEND_SYSTEM_PROMPT, TIEBREAK_SYSTEM_PROMPT, MAX_REGENERATIONS, MONTHS } from '@/lib/constants';

// ─── Types ───────────────────────────────────────────────────
interface PickResult {
  title: string;
  author: string;
  isbn?: string;
  pitch: string;
  pick_type: 'fresh' | 'reread' | 'wildcard';
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

interface TasteProfileRow {
  user_id: string;
  profile_json: Record<string, unknown>;
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

async function callClaude(system: string, prompt: string, maxTokens = 1500): Promise<string | null> {
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

function formatBookList(books: UserBookRow[], limit = 20): string {
  return books.slice(0, limit).map((ub) => {
    const parts = [`"${ub.book.title}" by ${ub.book.author || 'Unknown'}`];
    if (ub.rating) parts.push(`(${ub.rating}/5)`);
    if (ub.hot_take) parts.push(`— "${ub.hot_take}"`);
    return parts.join(' ');
  }).join('\n');
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
  try {
    const params = new URLSearchParams({
      q: query,
      maxResults: '1',
      printType: 'books',
      orderBy: 'relevance',
      langRestrict: 'en',
    });

    const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
    if (apiKey) params.set('key', apiKey);

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
      coverUrl = coverUrl.replace('http://', 'https://');
      coverUrl = coverUrl.replace('zoom=1', 'zoom=2');
      coverUrl = coverUrl.replace('&edge=curl', '');
    }

    let publishYear: number | null = null;
    if (v.publishedDate) {
      const match = v.publishedDate.match(/^(\d{4})/);
      if (match) publishYear = parseInt(match[1]);
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
  } catch (err) {
    console.error('Google Books search error:', err);
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
  // Try to find by ISBN first
  if (bookData.isbn) {
    const { data: existing } = await supabase
      .from('books')
      .select('id')
      .eq('isbn', bookData.isbn)
      .maybeSingle();
    if (existing) return existing.id;
  }

  // Try by title+author
  const { data: byTitle } = await supabase
    .from('books')
    .select('id')
    .ilike('title', bookData.title)
    .maybeSingle();
  if (byTitle) return byTitle.id;

  // Insert new
  const { data: inserted, error } = await supabase
    .from('books')
    .insert(bookData)
    .select('id')
    .single();

  if (error) {
    console.error('Book insert error:', error);
    return null;
  }
  return inserted.id;
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

  // Fetch the book details for each pick
  const bookIds = [pick.fresh_pick, pick.reread_pick, pick.wildcard_pick, pick.selected_book].filter(Boolean);
  const books: Record<string, unknown> = {};

  if (bookIds.length > 0) {
    const { data: bookRows } = await supabase
      .from('books')
      .select('*')
      .in('id', bookIds);

    if (bookRows) {
      for (const b of bookRows) {
        books[b.id] = b;
      }
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

// ─── Generate Monthly Picks ──────────────────────────────────
async function handleGenerate(supabase: ReturnType<typeof getSupabase>, body: { rejectedReason?: string }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Check if picks already exist
  const { data: existing } = await supabase
    .from('monthly_picks')
    .select('id, regeneration_count, status')
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  const isNewCycle = existing?.status === 'completed';

  if (existing && !isNewCycle && existing.regeneration_count >= MAX_REGENERATIONS) {
    return NextResponse.json({ error: 'Maximum regenerations reached for this month' }, { status: 400 });
  }

  // 1. Gather all data
  const { data: users } = await supabase.from('users').select('id, name');
  if (!users || users.length < 2) {
    return NextResponse.json({ error: 'Need both users to generate picks' }, { status: 400 });
  }

  const greg = users.find((u) => u.name === 'Greg');
  const mati = users.find((u) => u.name === 'Mati');
  if (!greg || !mati) {
    return NextResponse.json({ error: 'Could not find Greg and Mati' }, { status: 400 });
  }

  // Fetch all user_books with book details
  const { data: gregBooks } = await supabase
    .from('user_books')
    .select('status, rating, hot_take, book:books(*)')
    .eq('user_id', greg.id) as { data: UserBookRow[] | null };

  const { data: matiBooks } = await supabase
    .from('user_books')
    .select('status, rating, hot_take, book:books(*)')
    .eq('user_id', mati.id) as { data: UserBookRow[] | null };

  // Fetch taste profiles
  const { data: profiles } = await supabase
    .from('taste_profiles')
    .select('user_id, profile_json') as { data: TasteProfileRow[] | null };

  const gregProfile = profiles?.find((p) => p.user_id === greg.id)?.profile_json;
  const matiProfile = profiles?.find((p) => p.user_id === mati.id)?.profile_json;

  // Fetch past picks to avoid repeats
  const { data: pastPicks } = await supabase
    .from('monthly_picks')
    .select('fresh_pick, reread_pick, wildcard_pick, selected_book, month, year')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12);

  const pastPickBookIds = (pastPicks || []).flatMap((p) =>
    [p.fresh_pick, p.reread_pick, p.wildcard_pick, p.selected_book].filter(Boolean)
  );

  let pastPickTitles: string[] = [];
  if (pastPickBookIds.length > 0) {
    const { data: pastBooks } = await supabase
      .from('books')
      .select('title')
      .in('id', pastPickBookIds);
    pastPickTitles = (pastBooks || []).map((b) => b.title);
  }

  // Fetch pending suggestions — cast to avoid Supabase join type issues
  const { data: suggestionsRaw } = await supabase
    .from('suggestions')
    .select('reason, book:books(title, author)')
    .eq('status', 'pending');

  const suggestionsText = (suggestionsRaw || []).map((s: Record<string, unknown>) => {
    const book = s.book as { title: string; author: string | null } | { title: string; author: string | null }[] | null;
    const bookObj = Array.isArray(book) ? book[0] : book;
    const reason = s.reason as string | null;
    if (!bookObj) return null;
    return `"${bookObj.title}" by ${bookObj.author}${reason ? ` — "${reason}"` : ''}`;
  }).filter(Boolean).join('\n') || 'None';

  // 2. Build the Claude prompt
  const gregRead = (gregBooks || []).filter((ub) => ub.status === 'read' || ub.status === 'would_reread');
  const matiRead = (matiBooks || []).filter((ub) => ub.status === 'read' || ub.status === 'would_reread');
  const gregWouldReread = (gregBooks || []).filter((ub) => ub.status === 'would_reread');
  const matiWouldReread = (matiBooks || []).filter((ub) => ub.status === 'would_reread');

  // Determine whose turn to host the re-read
  const pastPickCount = (pastPicks || []).length;
  const rereadHost = pastPickCount % 2 === 0 ? 'Greg' : 'Mati';
  const rereadList = rereadHost === 'Greg' ? gregWouldReread : matiWouldReread;
  const rereadPartner = rereadHost === 'Greg' ? 'Mati' : 'Greg';
  const rereadPartnerBooks = rereadHost === 'Greg' ? matiBooks : gregBooks;

  // Filter re-reads: only books the partner hasn't read
  const partnerReadTitles = new Set((rereadPartnerBooks || []).map((ub) => ub.book.title.toLowerCase()));
  const eligibleRereads = rereadList.filter((ub) => !partnerReadTitles.has(ub.book.title.toLowerCase()));

  const prompt = `Generate 3 book recommendations for ${MONTHS[month - 1]} ${year}.

== GREG'S TASTE PROFILE ==
${gregProfile ? JSON.stringify(gregProfile, null, 2) : 'Not yet generated'}

== GREG'S READING HISTORY (${gregRead.length} books read) ==
${formatBookList(gregRead)}

== MATI'S TASTE PROFILE ==
${matiProfile ? JSON.stringify(matiProfile, null, 2) : 'Not yet generated'}

== MATI'S READING HISTORY (${matiRead.length} books read) ==
${formatBookList(matiRead)}

== RE-READ CANDIDATES (${rereadHost}'s "would re-read" list, that ${rereadPartner} hasn't read) ==
${eligibleRereads.length > 0 ? eligibleRereads.map((ub) => `"${ub.book.title}" by ${ub.book.author}`).join('\n') : 'None available — suggest a fresh book instead'}

== PAST MONTHLY PICKS (do NOT repeat these) ==
${pastPickTitles.length > 0 ? pastPickTitles.join(', ') : 'None yet'}

== USER SUGGESTIONS TO CONSIDER ==
${suggestionsText}

${body.rejectedReason ? `== PREVIOUS PICKS WERE REJECTED ==\nReason: ${body.rejectedReason}\nGo in a different direction this time.\n` : ''}
Return ONLY a valid JSON object (no markdown, no backticks) with this structure:
{
  "picks": [
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "fresh" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "reread" },
    { "title": "Book Title", "author": "Author Name", "isbn": "ISBN if known or null", "pitch": "2-3 sentence personalized pitch", "pick_type": "wildcard" }
  ],
  "reasoning": "1-2 sentence overview of why these 3 books work together as a set"
}`;

  const claudeResponse = await callClaude(
    RECOMMEND_SYSTEM_PROMPT + '\nReturn only valid JSON with no markdown or backticks.',
    prompt,
    2000
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

  if (!parsed.picks || parsed.picks.length < 3) {
    return NextResponse.json({ error: 'AI returned incomplete picks' }, { status: 500 });
  }

  // 3. Validate each pick via Google Books and store in DB
  const bookIds: Record<string, string | null> = { fresh: null, reread: null, wildcard: null };

  for (const pick of parsed.picks) {
    // Check if it's already in the DB (e.g. a re-read from user's shelf)
    const { data: existingBook } = await supabase
      .from('books')
      .select('id')
      .ilike('title', pick.title)
      .maybeSingle();

    if (existingBook) {
      bookIds[pick.pick_type] = existingBook.id;
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
    bookIds[pick.pick_type] = bookId;
  }

  // 4. Upsert the monthly pick record
  const pickData = {
    month,
    year,
    fresh_pick: bookIds.fresh,
    reread_pick: bookIds.reread,
    wildcard_pick: bookIds.wildcard,
    selected_book: null,
    greg_vote: null,
    mati_vote: null,
    ai_reasoning: parsed.reasoning + '\n\n' + parsed.picks.map((p) => `**${p.pick_type.toUpperCase()}:** ${p.pitch}`).join('\n\n'),
    ai_tiebreak_reasoning: null,
    status: 'voting' as const,
    regeneration_count: (existing && !isNewCycle) ? existing.regeneration_count + 1 : 0,
  };

  if (existing) {
    await supabase
      .from('monthly_picks')
      .update(pickData)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('monthly_picks')
      .insert(pickData);
  }

  return NextResponse.json({ success: true });
}

// ─── Vote ────────────────────────────────────────────────────
async function handleVote(supabase: ReturnType<typeof getSupabase>, body: { userId: string; bookId: string }) {
  const { userId, bookId } = body;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Find the user's name
  const { data: user } = await supabase
    .from('users')
    .select('name')
    .eq('id', userId)
    .single();

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const voteColumn = user.name === 'Greg' ? 'greg_vote' : 'mati_vote';

  const { error } = await supabase
    .from('monthly_picks')
    .update({ [voteColumn]: bookId })
    .eq('month', month)
    .eq('year', year);

  if (error) {
    return NextResponse.json({ error: 'Vote failed' }, { status: 500 });
  }

  // Check if both have voted and they agree
  const { data: pick } = await supabase
    .from('monthly_picks')
    .select('greg_vote, mati_vote')
    .eq('month', month)
    .eq('year', year)
    .single();

  if (pick?.greg_vote && pick?.mati_vote) {
    if (pick.greg_vote === pick.mati_vote) {
      // They agree! Mark as selected
      await supabase
        .from('monthly_picks')
        .update({ selected_book: pick.greg_vote, status: 'selected' })
        .eq('month', month)
        .eq('year', year);

      return NextResponse.json({ success: true, agreed: true, selectedBook: pick.greg_vote });
    } else {
      // Disagreement — needs tiebreak
      return NextResponse.json({ success: true, agreed: false, needsTiebreak: true });
    }
  }

  return NextResponse.json({ success: true, voted: true });
}

// ─── AI Tiebreak ─────────────────────────────────────────────
async function handleTiebreak(supabase: ReturnType<typeof getSupabase>) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: pick } = await supabase
    .from('monthly_picks')
    .select('*')
    .eq('month', month)
    .eq('year', year)
    .single();

  if (!pick || !pick.greg_vote || !pick.mati_vote) {
    return NextResponse.json({ error: 'Both votes needed for tiebreak' }, { status: 400 });
  }

  // Fetch the two voted books
  const { data: votedBooks } = await supabase
    .from('books')
    .select('*')
    .in('id', [pick.greg_vote, pick.mati_vote]);

  const gregVoteBook = votedBooks?.find((b) => b.id === pick.greg_vote);
  const matiVoteBook = votedBooks?.find((b) => b.id === pick.mati_vote);

  // Determine pick types
  const gregPickType = pick.greg_vote === pick.fresh_pick ? 'fresh' :
    pick.greg_vote === pick.reread_pick ? 'reread' : 'wildcard';
  const matiPickType = pick.mati_vote === pick.fresh_pick ? 'fresh' :
    pick.mati_vote === pick.reread_pick ? 'reread' : 'wildcard';

  // Fetch taste profiles for context
  const { data: profiles } = await supabase
    .from('taste_profiles')
    .select('user_id, profile_json');

  const { data: users } = await supabase.from('users').select('id, name');
  const greg = users?.find((u) => u.name === 'Greg');
  const mati = users?.find((u) => u.name === 'Mati');

  const gregProfile = profiles?.find((p) => p.user_id === greg?.id)?.profile_json;
  const matiProfile = profiles?.find((p) => p.user_id === mati?.id)?.profile_json;

  const prompt = `Break this tie for ${MONTHS[month - 1]} ${year}:

Greg voted for: "${gregVoteBook?.title}" by ${gregVoteBook?.author} (${gregPickType} pick)
Mati voted for: "${matiVoteBook?.title}" by ${matiVoteBook?.author} (${matiPickType} pick)

Greg's taste profile: ${JSON.stringify(gregProfile || {})}
Mati's taste profile: ${JSON.stringify(matiProfile || {})}

Which book should be this month's read? Return ONLY valid JSON: { "winner": "${gregPickType}" or "${matiPickType}", "reasoning": "your warm, fair explanation" }`;

  const claudeResponse = await callClaude(TIEBREAK_SYSTEM_PROMPT, prompt, 500);

  let winnerId = pick.greg_vote; // default to Greg if AI fails
  let reasoning = 'The owl flipped a coin (AI tiebreak unavailable).';

  if (claudeResponse) {
    try {
      const cleaned = claudeResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const result = JSON.parse(cleaned);

      // Map the winner pick_type back to a book ID
      const winnerType = result.winner;
      if (winnerType === 'fresh') winnerId = pick.fresh_pick;
      else if (winnerType === 'reread') winnerId = pick.reread_pick;
      else if (winnerType === 'wildcard') winnerId = pick.wildcard_pick;

      reasoning = result.reasoning || reasoning;
    } catch {
      console.error('Tiebreak parse error:', claudeResponse);
    }
  }

  await supabase
    .from('monthly_picks')
    .update({
      selected_book: winnerId,
      ai_tiebreak_reasoning: reasoning,
      status: 'selected',
    })
    .eq('month', month)
    .eq('year', year);

  return NextResponse.json({ success: true, winnerId, reasoning });
}