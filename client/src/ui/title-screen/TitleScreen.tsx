import { useState, useEffect } from 'react';
import { SettingsModal } from './SettingsModal';
import { Particles } from './Particles';
import { useTitleAudio } from './use-title-audio';
import './TitleScreen.css';

interface TitleScreenProps {
  onPlay: () => void;
}

export function TitleScreen({ onPlay }: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { playClick } = useTitleAudio();

  useEffect(() => {
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  function handlePlay() {
    playClick();
    onPlay();
  }

  function handleOpenSettings() {
    playClick();
    setSettingsOpen(true);
  }

  function handleCloseSettings() {
    playClick();
    setSettingsOpen(false);
  }

  return (
    <div className={`title-screen ${loaded ? 'loaded' : ''}`}>
      <div
        className="title-bg"
        style={{ backgroundImage: "url('/splash.jpg')" }}
      />
      <div className="title-vignette" />
      <div className="title-scanlines" />
      <Particles />

      <div className="title-content">
        <div className="title-text-group">
          <h1 className="title-glitch" data-text="IT'S TIME TO BUILD">
            IT'S TIME TO BUILD
          </h1>
          <div className="title-rule" />
          <p className="subtitle">THE EXPERIENCE</p>
        </div>

        <button className="play-btn" onClick={handlePlay}>
          <span className="play-btn-text">[ ENTER ]</span>
          <span className="play-btn-glow" />
        </button>

        <p className="version-tag">v0.1.0 // ALPHA BUILD</p>
      </div>

      <button
        className="settings-gear"
        onClick={handleOpenSettings}
        aria-label="Settings"
      >
        &#x2699;
      </button>

      <SettingsModal
        open={settingsOpen}
        onClose={handleCloseSettings}
        onClickSound={playClick}
      />
    </div>
  );
}
