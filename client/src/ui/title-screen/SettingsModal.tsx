import { useState, useEffect } from 'react';
import { getApiKey, setApiKey } from '../../utils/api-keys';
import { getProjectDir, setProjectDir, setProjectInitFlag } from '../../utils/project-settings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onClickSound?: () => void;
}

export function SettingsModal({ open, onClose, onClickSound }: SettingsModalProps) {
  const [mistralKey, setMistralKey] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [projectDirValue, setProjectDirValue] = useState('');
  const [showMistral, setShowMistral] = useState(false);
  const [showElevenlabs, setShowElevenlabs] = useState(false);

  useEffect(() => {
    if (open) {
      setMistralKey(getApiKey('mistral') ?? '');
      setElevenlabsKey(getApiKey('elevenlabs') ?? '');
      setProjectDirValue(getProjectDir() ?? '');
      setShowMistral(false);
      setShowElevenlabs(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave() {
    onClickSound?.();
    setApiKey('mistral', mistralKey);
    setApiKey('elevenlabs', elevenlabsKey);
    setProjectDir(projectDirValue);
    onClose();
  }

  function handleInitProjects() {
    onClickSound?.();
    setProjectInitFlag(true);
  }

  function handleResetProjects() {
    onClickSound?.();
    if (confirm('Reset all projects? This will delete generated code in the project directory.')) {
      setProjectInitFlag(false);
      // Send ResetProjects on next game start by setting a reset flag
      localStorage.setItem('project_should_reset', 'true');
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  function handleClose() {
    onClickSound?.();
    onClose();
  }

  function toggleMistral() {
    onClickSound?.();
    setShowMistral(!showMistral);
  }

  function toggleElevenlabs() {
    onClickSound?.();
    setShowElevenlabs(!showElevenlabs);
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-panel">
        <button className="modal-close" onClick={handleClose} aria-label="Close settings">
          X
        </button>
        <h2 className="modal-title">Settings</h2>

        <div className="input-group">
          <label>Mistral API Key</label>
          <div className="input-wrapper">
            <input
              type={showMistral ? 'text' : 'password'}
              value={mistralKey}
              onChange={(e) => setMistralKey(e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="toggle-visibility"
              onClick={toggleMistral}
              type="button"
            >
              {showMistral ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <div className="input-group">
          <label>ElevenLabs API Key</label>
          <div className="input-wrapper">
            <input
              type={showElevenlabs ? 'text' : 'password'}
              value={elevenlabsKey}
              onChange={(e) => setElevenlabsKey(e.target.value)}
              placeholder="sk-..."
              spellCheck={false}
              autoComplete="off"
            />
            <button
              className="toggle-visibility"
              onClick={toggleElevenlabs}
              type="button"
            >
              {showElevenlabs ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="input-group">
          <label>Project Directory</label>
          <span className="input-hint">
            Base directory where building code projects will be created
          </span>
          <input
            type="text"
            value={projectDirValue}
            onChange={(e) => setProjectDirValue(e.target.value)}
            placeholder="/home/user/projects"
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="settings-actions">
          <button
            className="action-btn action-btn--init"
            onClick={handleInitProjects}
            type="button"
          >
            Initialize Projects
          </button>
          <button
            className="action-btn action-btn--reset"
            onClick={handleResetProjects}
            type="button"
          >
            Reset All Projects
          </button>
        </div>

        <button className="save-btn" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}
