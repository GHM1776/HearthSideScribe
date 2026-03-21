import type { Metadata, Viewport } from 'next';
import './globals.css';
import RainEffect from '@/components/RainEffect';
import DustParticles from '@/components/DustParticles';
import LightningFlash from '@/components/LightningFlash';
import AmbientSounds from '@/components/AmbientSounds';

export const metadata: Metadata = {
  title: 'HearthsideScribe',
  description: 'A castle library for two â€” powered by an owl with opinions.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HearthsideScribe',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1A1215',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body className="min-h-[100dvh] relative">
        <div className="stone-overlay" />
        <RainEffect />
        <DustParticles />
        <LightningFlash />
        <div className="vignette-overlay" />
        <AmbientSounds />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
