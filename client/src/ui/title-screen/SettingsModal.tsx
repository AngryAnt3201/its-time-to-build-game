import { useState, useEffect } from 'react';
import { getApiKey, setApiKey } from '../../utils/api-keys';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onClickSound?: () => void;
}

export function SettingsModal({ open, onClose, onClickSound }: SettingsModalProps) {
  const [mistralKey, setMistralKey] = useState('');
  const [elevenlabsKey, setElevenlabsKey] = useState('');
  const [showMistral, setShowMistral] = useState(false);
  const [showElevenlabs, setShowElevenlabs] = useState(false);

  useEffect(() => {
    if (open) {
      setMistralKey(getApiKey('mistral') ?? '');
      setElevenlabsKey(getApiKey('elevenlabs') ?? '');
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
    onClose();
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

        <button className="save-btn" onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}
