import { useState, useEffect } from 'react';
import { SettingsModal } from './SettingsModal';
import { Particles } from './Particles';
import './TitleScreen.css';

interface TitleScreenProps {
  onPlay: () => void;
}

export function TitleScreen({ onPlay }: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Trigger staggered entrance animations after mount
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  return (
    <div className={`title-screen ${loaded ? 'loaded' : ''}`}>
      {/* Background image layer */}
      <div
        className="title-bg"
        style={{ backgroundImage: "url('/splash.jpg')" }}
      />

      {/* Vignette overlay — darkens edges, focuses center */}
      <div className="title-vignette" />

      {/* Scanline overlay — CRT terminal feel */}
      <div className="title-scanlines" />

      {/* Particle system — embers, sparks, motes, dust */}
      <Particles />

      {/* Content */}
      <div className="title-content">
        <div className="title-text-group">
          <h1 className="title-glitch" data-text="IT'S TIME TO BUILD">
            IT'S TIME TO BUILD
          </h1>
          <div className="title-rule" />
          <p className="subtitle">THE EXPERIENCE</p>
        </div>

        <button className="play-btn" onClick={onPlay}>
          <span className="play-btn-text">[ ENTER ]</span>
          <span className="play-btn-glow" />
        </button>

        <p className="version-tag">v0.1.0 // ALPHA BUILD</p>
      </div>

      <button
        className="settings-gear"
        onClick={() => setSettingsOpen(true)}
        aria-label="Settings"
      >
        &#x2699;
      </button>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
