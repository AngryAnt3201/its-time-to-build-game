import { useState } from 'react';
import { SettingsModal } from './SettingsModal';
import './TitleScreen.css';

interface TitleScreenProps {
  onPlay: () => void;
}

export function TitleScreen({ onPlay }: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="title-screen">
      <h1>IT'S TIME TO BUILD</h1>
      <p className="subtitle">THE EXPERIENCE</p>

      <button className="play-btn" onClick={onPlay}>
        PLAY
      </button>

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
