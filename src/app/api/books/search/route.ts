import { NextRequest, NextResponse } from 'next/server';
import { searchGoogleBooks, extractBookData } from '@/lib/google-books';

// Normalize title for dedup — strip subtitles, edition markers, parentheticals
function normalizeTitle(title: string | undefined | null): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, '')           // remove parentheticals: (Penguin Classics)
    .replace(/\[.*?\]/g, '')           // remove brackets: [Annotated]
    .replace(/:.*/g, '')               // remove everything after colon (subtitles)
    .replace(/\b(edition|ed|vol|volume|unabridged|abridged|annotated|illustrated|revised|deluxe|classics?|penguin|vintage)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, '')      // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Fetch more results than we need so we can filter aggressively
    const items = await searchGoogleBooks(query, 20);
    const allResults = items.map((item) => ({
      ...extractBookData(item),
      google_books_id: item.id,
    }));

    // 1. Filter: only books with cover art AND a title
    const withCovers = allResults.filter((r) => r.cover_url && r.title);

    // 2. Deduplicate: keep the first (most relevant) edition per title+author combo
    const seen = new Set<string>();
    const deduped = withCovers.filter((r) => {
      const key = normalizeTitle(r.title) + '||' + (r.author || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 3. Limit to 3 results
    const results = deduped.slice(0, 3);

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Book search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}