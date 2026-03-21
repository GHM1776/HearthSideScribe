import type { GoogleBooksResponse, GoogleBookItem } from './types';

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1/volumes';

export async function searchGoogleBooks(
  query: string,
  maxResults: number = 10
): Promise<GoogleBookItem[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults),
    printType: 'books',
    orderBy: 'relevance',
    langRestrict: 'en',
  });

  if (apiKey) {
    params.set('key', apiKey);
  }

  const res = await fetch(`${GOOGLE_BOOKS_BASE}?${params}`);

  if (!res.ok) {
    throw new Error(`Google Books API error: ${res.status}`);
  }

  const data: GoogleBooksResponse = await res.json();
  return data.items || [];
}

export async function getGoogleBook(volumeId: string): Promise<GoogleBookItem | null> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const params = new URLSearchParams();

  if (apiKey) {
    params.set('key', apiKey);
  }

  const url = `${GOOGLE_BOOKS_BASE}/${volumeId}${params.toString() ? '?' + params : ''}`;
  const res = await fetch(url);

  if (!res.ok) return null;
  return res.json();
}

export function extractBookData(item: GoogleBookItem) {
  const v = item.volumeInfo;

  const isbn13 = v.industryIdentifiers?.find((id) => id.type === 'ISBN_13');
  const isbn10 = v.industryIdentifiers?.find((id) => id.type === 'ISBN_10');
  const isbn = isbn13?.identifier || isbn10?.identifier || null;

  let coverUrl = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || null;
  if (coverUrl) {
    coverUrl = coverUrl.replace('http://', 'https://');
    coverUrl = coverUrl.replace('zoom=1', 'zoom=2');
    coverUrl = coverUrl.replace('&edge=curl', '');
  }

  let publishYear: number | null = null;
  if (v.publishedDate) {
    const yearMatch = v.publishedDate.match(/^(\d{4})/);
    if (yearMatch) publishYear = parseInt(yearMatch[1]);
  }

  return {
    title: v.title,
    author: v.authors?.join(', ') || null,
    cover_url: coverUrl,
    isbn,
    genres: v.categories || [],
    synopsis: v.description || null,
    page_count: v.pageCount || null,
    publish_year: publishYear,
    google_books_id: item.id,
  };
}