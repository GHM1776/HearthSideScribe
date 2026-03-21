import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET — list all books (optionally filter)
export async function GET(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const search = request.nextUrl.searchParams.get('search');

  let query = supabase.from('books').select('*').order('title');

  if (search) {
    query = query.or(`title.ilike.%${search}%,author.ilike.%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ books: data });
}

// POST — add a new book to the library
export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await request.json();

  const { title, author, cover_url, isbn, genres, synopsis, page_count, publish_year } = body;

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Check if book already exists by ISBN or exact title+author match
  if (isbn) {
    const { data: existing } = await supabase
      .from('books')
      .select('id')
      .eq('isbn', isbn)
      .single();

    if (existing) {
      return NextResponse.json({ book: existing, existing: true });
    }
  }

  if (author) {
    const { data: existing } = await supabase
      .from('books')
      .select('id')
      .ilike('title', title)
      .ilike('author', author)
      .single();

    if (existing) {
      return NextResponse.json({ book: existing, existing: true });
    }
  }

  const { data, error } = await supabase
    .from('books')
    .insert({
      title,
      author,
      cover_url,
      isbn,
      genres: genres || [],
      synopsis,
      page_count,
      publish_year,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ book: data, existing: false }, { status: 201 });
}