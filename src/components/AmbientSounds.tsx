'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { AMBIENT_SOUNDS, type SoundKey } from '@/lib/constants';

export default function AmbientSounds() {
  const [isActive, setIsActive] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [volumes, setVolumes] = useState<Record<SoundKey, number>>(() => {
    const defaults: Record<string, number> = {};
    for (const [key, config] of Object.entries(AMBIENT_SOUNDS)) {
      defaults[key] = config.defaultVolume;
    }
    return defaults as Record<SoundKey, number>;
  });
  const [enabledLayers, setEnabledLayers] = useState<Record<SoundKey, boolean>>({
    rain: true,
    fireplace: true,
    thunder: true,
    pages: false,
  });

  const howlsRef = useRef<Record<string, any>>({});
  const initializedRef = useRef(false);

  const initializeSounds = useCallback(async () => {
    if (initializedRef.current) return;
    try {
      const { Howl } = await import('howler');
      for (const [key, config] of Object.entries(AMBIENT_SOUNDS)) {
        const isLoop = key !== 'pages';
        howlsRef.current[key] = new Howl({
          src: [config.file],
          loop: isLoop,
          volume: volumes[key as SoundKey],
          preload: true,
        });
      }
      initializedRef.current = true;
    } catch {
      console.warn('Howler.js not available');
    }
  }, [volumes]);

  const startPlaying = useCallback(async () => {
    await initializeSounds();
    setIsActive(true);
    localStorage.setItem('bookclub-sound-active', 'true');
    localStorage.setItem('bookclub-sound-prompted', 'true');
  }, [initializeSounds]);

  // On mount, check if sound was previously active
  useEffect(() => {
    const wasActive = localStorage.getItem('bookclub-sound-active');
    if (wasActive === 'true') {
      startPlaying();
    }
  }, [startPlaying]);

  // Listen for gateway "start-ambient" event
  useEffect(() => {
    const handler = () => startPlaying();
    window.addEventListener('start-ambient', handler);
    return () => window.removeEventListener('start-ambient', handler);
  }, [startPlaying]);

  // Play/pause based on active state and enabled layers
  useEffect(() => {
    if (!initializedRef.current) return;
    for (const [key, howl] of Object.entries(howlsRef.current)) {
      const soundKey = key as SoundKey;
      if (isActive && enabledLayers[soundKey]) {
        if (!howl.playing()) howl.play();
      } else {
        howl.pause();
      }
    }
    localStorage.setItem('bookclub-sound-active', String(isActive));
  }, [isActive, enabledLayers]);

  // Update volumes
  useEffect(() => {
    for (const [key, howl] of Object.entries(howlsRef.current)) {
      howl.volume(volumes[key as SoundKey]);
    }
  }, [volumes]);

  const toggleActive = async () => {
    if (!initializedRef.current) await initializeSounds();
    setIsActive(!isActive);
  };

  const toggleLayer = (key: SoundKey) => {
    setEnabledLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const howl = howlsRef.current[key];
      if (howl) {
        if (next[key] && isActive) {
          if (!howl.playing()) howl.play();
        } else {
          howl.pause();
        }
      }
      return next;
    });
  };

  return (
    <>
      <button
        onClick={toggleActive}
        onContextMenu={(e) => { e.preventDefault(); setShowPanel(!showPanel); }}
        className={`sound-toggle ${isActive ? 'active' : ''}`}
        aria-label={isActive ? 'Mute ambient sounds' : 'Enable ambient sounds'}
      >
        {isActive ? (
          <Volume2 size={18} className="text-gold" />
        ) : (
          <VolumeX size={18} className="text-parchment/50" />
        )}
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setShowPanel(false)} />
          <div className="fixed top-16 right-4 z-[95] castle-card p-4 w-56 space-y-3 animate-fade-in">
            <p className="font-display text-gold text-sm tracking-wider">Sound Mixer</p>
            {(Object.entries(AMBIENT_SOUNDS) as [SoundKey, typeof AMBIENT_SOUNDS[SoundKey]][]).map(
              ([key, config]) => (
                <div key={key} className="space-y-1">
                  <button
                    onClick={() => toggleLayer(key)}
                    className={`text-xs font-ui transition-colors ${
                      enabledLayers[key] ? 'text-parchment' : 'text-parchment/30'
                    }`}
                  >
                    {config.label}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volumes[key]}
                    onChange={(e) =>
                      setVolumes((prev) => ({ ...prev, [key]: parseFloat(e.target.value) }))
                    }
                    className="w-full h-1 accent-gold bg-castle-surface-light rounded-full"
                    disabled={!enabledLayers[key]}
                  />
                </div>
              )
            )}
          </div>
        </>
      )}
    </>
  );
}