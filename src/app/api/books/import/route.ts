import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { searchGoogleBooks, extractBookData } from '@/lib/google-books';

interface ImportRow {
  title: string;
  author: string;
  isbn?: string;
  rating?: number;
  shelf?: string;
}

// POST — two actions: "import" and "backfill-covers"
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json();
  const { action } = body;

  if (action === 'import') {
    return handleImport(supabase, body);
  } else if (action === 'backfill-covers') {
    return handleBackfillCovers(supabase, body);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

async function handleImport(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  body: { userId: string; books: ImportRow[] }
) {
  const { userId, books } = body;

  if (!userId || !books || !Array.isArray(books)) {
    return NextResponse.json({ error: 'userId and books array required' }, { status: 400 });
  }

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of books) {
    try {
      if (!row.title || row.title.trim().length === 0) {
        errors++;
        continue;
      }

      const title = row.title.trim();
      const author = row.author?.trim() || null;
      const isbn = row.isbn?.trim() || null;

      // Check if book already exists by ISBN or title+author
      let bookId: string | null = null;

      if (isbn) {
        const { data: existing } = await supabase
          .from('books')
          .select('id')
          .eq('isbn', isbn)
          .maybeSingle();
        if (existing) bookId = existing.id;
      }

      if (!bookId && author) {
        const { data: existing } = await supabase
          .from('books')
          .select('id')
          .ilike('title', title)
          .ilike('author', author)
          .maybeSingle();
        if (existing) bookId = existing.id;
      }

      if (!bookId) {
        // Title-only fallback match
        const { data: existing } = await supabase
          .from('books')
          .select('id')
          .ilike('title', title)
          .maybeSingle();
        if (existing) bookId = existing.id;
      }

      // Insert new book if not found
      if (!bookId) {
        const { data: newBook, error: insertError } = await supabase
          .from('books')
          .insert({
            title,
            author,
            isbn,
            cover_url: null,
            genres: [],
            synopsis: null,
            page_count: null,
            publish_year: null,
          })
          .select('id')
          .single();

        if (insertError || !newBook) {
          console.error(`[import] Failed to insert book "${title}":`, insertError?.message);
          errors++;
          continue;
        }
        bookId = newBook.id;
      }

      // Check if user already has this book on their shelf
      const { data: existingUserBook } = await supabase
        .from('user_books')
        .select('id')
        .eq('user_id', userId)
        .eq('book_id', bookId)
        .maybeSingle();

      if (existingUserBook) {
        skipped++;
        continue;
      }

      // Map shelf status
      let status = 'read';
      if (row.shelf) {
        const shelf = row.shelf.toLowerCase().trim();
        if (shelf === 'currently-reading' || shelf === 'reading') status = 'reading';
        else if (shelf === 'to-read' || shelf === 'want-to-read') status = 'want_to_read';
        else if (shelf === 'read') status = 'read';
      }

      // Map rating — 5-star reads become would_reread
      const rating = row.rating && row.rating >= 1 && row.rating <= 5 ? row.rating : null;
      if (rating === 5 && status === 'read') {
        status = 'would_reread';
      }

      const { error: userBookError } = await supabase.from('user_books').insert({
        user_id: userId,
        book_id: bookId,
        status,
        rating,
        hot_take: null,
        date_added: new Date().toISOString(),
        ...(status === 'read' || status === 'would_reread'
          ? { date_finished: new Date().toISOString() }
          : {}),
      });

      if (userBookError) {
        console.error(`[import] Failed to add "${title}" to shelf:`, userBookError.message);
        errors++;
        continue;
      }

      imported++;
    } catch (err) {
      console.error(`[import] Error processing row:`, err);
      errors++;
    }
  }

  console.log(`[import] Done: ${imported} imported, ${skipped} skipped, ${errors} errors`);
  return NextResponse.json({ imported, skipped, errors });
}

async function handleBackfillCovers(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  body: { userId: string }
) {
  const { userId } = body;
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  // Get all books on user's shelf that have no cover
  const { data: userBooks } = await supabase
    .from('user_books')
    .select('book_id, book:books(id, title, author, cover_url)')
    .eq('user_id', userId);

  if (!userBooks) {
    return NextResponse.json({ backfilled: 0 });
  }

  const booksNeedingCovers = userBooks
    .filter((ub: any) => ub.book && !ub.book.cover_url)
    .map((ub: any) => ub.book);

  let backfilled = 0;

  for (const book of booksNeedingCovers) {
    try {
      const query = `${book.title}${book.author ? ' ' + book.author : ''}`;
      const results = await searchGoogleBooks(query, 1);

      if (results.length > 0) {
        const bookData = extractBookData(results[0]);
        if (bookData.cover_url) {
          await supabase
            .from('books')
            .update({
              cover_url: bookData.cover_url,
              ...(bookData.genres && bookData.genres.length > 0 ? { genres: bookData.genres } : {}),
              ...(bookData.page_count ? { page_count: bookData.page_count } : {}),
              ...(bookData.publish_year ? { publish_year: bookData.publish_year } : {}),
              ...(bookData.synopsis ? { synopsis: bookData.synopsis } : {}),
            })
            .eq('id', book.id);

          backfilled++;
        }
      }

      // Small delay to avoid rate limiting Google Books API
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (err) {
      console.error(`[backfill] Error for "${book.title}":`, err);
    }
  }

  console.log(`[backfill] Backfilled covers for ${backfilled}/${booksNeedingCovers.length} books`);
  return NextResponse.json({ backfilled, total: booksNeedingCovers.length });
}