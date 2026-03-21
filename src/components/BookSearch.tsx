'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, BookOpen } from 'lucide-react';

interface SearchResult {
  title: string;
  author: string | null;
  cover_url: string | null;
  isbn: string | null;
  genres: string[];
  synopsis: string | null;
  page_count: number | null;
  publish_year: number | null;
  google_books_id: string;
}

interface BookSearchProps {
  onSelect: (result: SearchResult) => void;
}

export default function BookSearch({ onSelect }: BookSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/books/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results || []);
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setQuery('');
      setResults([]);
      setShowResults(false);
      onSelect(result);
    },
    [onSelect]
  );

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parchment/30 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="Search by title or author..."
          className="input-castle pl-10 pr-10"
          autoComplete="off"
        />
        {isSearching && (
          <Loader2
            size={18}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gold animate-spin"
          />
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 castle-card max-h-[60vh] overflow-y-auto divide-y divide-castle-border">
          {results.map((result) => (
            <button
              key={result.google_books_id}
              onClick={() => handleSelect(result)}
              className="w-full p-3 flex gap-3 items-center text-left hover:bg-castle-surface-light active:bg-castle-surface-light transition-colors"
            >
              <div className="w-10 h-14 rounded overflow-hidden flex-shrink-0 bg-castle-surface-light">
                {result.cover_url ? (
                  <img
                    src={result.cover_url}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen size={14} className="text-parchment/20" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-parchment text-sm leading-tight truncate">
                  {result.title}
                </p>
                <p className="font-body text-parchment/50 text-xs">
                  {result.author || 'Unknown author'}
                  {result.publish_year ? ` \u00B7 ${result.publish_year}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && query.length >= 2 && results.length === 0 && !isSearching && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 castle-card p-4 text-center">
          <p className="font-body text-parchment/40 text-sm">
            No books found for &ldquo;{query}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}