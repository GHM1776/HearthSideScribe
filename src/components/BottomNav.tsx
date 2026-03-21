'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, PlusCircle, Calendar, User } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/bookshelf', label: 'Shelf', icon: BookOpen },
  { href: '/add-book', label: 'Add Book', icon: PlusCircle },
  { href: '/monthly-picks', label: 'Picks', icon: Calendar },
  { href: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <div className="flex items-stretch justify-around h-16 max-w-lg mx-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors duration-200 ${
                isActive ? 'text-gold' : 'text-parchment/40 active:text-parchment/70'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 1.5} className="transition-all duration-200" />
              <span className={`text-[10px] font-ui tracking-wider uppercase ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {label}
              </span>
              {isActive && <div className="absolute bottom-0 w-8 h-0.5 bg-gold rounded-full" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}