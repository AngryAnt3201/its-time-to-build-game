import { useState, useEffect } from 'react';
import { SettingsModal } from './SettingsModal';
import { Particles } from './Particles';
import { useTitleAudio } from './use-title-audio';
import { getProjectDir, setProjectDir, setProjectInitFlag, browseForDirectory } from '../../utils/project-settings';
import './TitleScreen.css';

interface TitleScreenProps {
  onPlay: () => void;
}

export function TitleScreen({ onPlay }: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [projectDir, setProjectDirState] = useState<string | null>(getProjectDir());
  const [browsing, setBrowsing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const { playClick } = useTitleAudio();

  useEffect(() => {
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  // Re-read project dir when settings modal closes (in case it was changed there)
  useEffect(() => {
    if (!settingsOpen) {
      setProjectDirState(getProjectDir());
    }
  }, [settingsOpen]);

  const isReady = !!projectDir && projectDir.length > 0;

  function handlePlay() {
    if (!isReady) return;
    playClick();
    setProjectInitFlag(true);
    setInitializing(true);
    onPlay();
  }

  async function handleBrowse() {
    playClick();
    setBrowsing(true);
    const path = await browseForDirectory();
    setBrowsing(false);
    if (path) {
      setProjectDir(path);
      setProjectDirState(path);
    }
  }

  function handleOpenSettings() {
    playClick();
    setSettingsOpen(true);
  }

  function handleCloseSettings() {
    playClick();
    setSettingsOpen(false);
  }

  // ── Initializing state: loading screen ──────────────────────────
  if (initializing) {
    return (
      <div className={`title-screen loaded`}>
        <div
          className="title-bg"
          style={{ backgroundImage: "url('/splash.jpg')" }}
        />
        <div className="title-vignette" />
        <div className="title-scanlines" />
        <Particles />

        <div className="title-content">
          <div className="init-loading">
            <h2 className="init-heading">SCAFFOLDING PROJECTS</h2>
            <div className="init-bar-track">
              <div className="init-bar-sweep" />
            </div>
            <p className="init-subtext">Generating React applications for each building...</p>
            <p className="init-hint">This may take a moment on first run</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Normal title screen ─────────────────────────────────────────
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

        {/* ── Project setup section ─────────────────────────── */}
        <div className="project-setup">
          {!isReady ? (
            <>
              <p className="setup-prompt">SELECT A PROJECT DIRECTORY TO BEGIN</p>
              <button
                className="browse-btn"
                onClick={handleBrowse}
                disabled={browsing}
              >
                <span className="browse-btn-text">
                  {browsing ? '[ WAITING FOR SELECTION... ]' : '[ SELECT DIRECTORY ]'}
                </span>
                <span className="browse-btn-glow" />
              </button>
            </>
          ) : (
            <>
              <div className="setup-ready">
                <span className="setup-dir-label">PROJECT DIR</span>
                <span className="setup-dir-path">{projectDir}</span>
              </div>
              <button
                className="browse-btn browse-btn--change"
                onClick={handleBrowse}
                disabled={browsing}
              >
                <span className="browse-btn-text">
                  {browsing ? '[ WAITING... ]' : '[ CHANGE ]'}
                </span>
              </button>
            </>
          )}
        </div>

        <button
          className={`play-btn ${!isReady ? 'play-btn--disabled' : ''}`}
          onClick={handlePlay}
          disabled={!isReady}
        >
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
