import { useRef, useCallback, useEffect } from 'react';

const AMBIENT_SRC = '/ambient-title.mp3';
const CLICK_SRC = '/ui-click.mp3';

/**
 * Manages title screen audio:
 * - Loops ambient music (starts on first user interaction due to autoplay policy)
 * - Plays click SFX on demand
 * - Stops ambient when the component unmounts
 */
export function useTitleAudio() {
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const clickRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  // Create audio elements once
  useEffect(() => {
    const ambient = new Audio(AMBIENT_SRC);
    ambient.loop = true;
    ambient.volume = 0.35;
    ambientRef.current = ambient;

    const click = new Audio(CLICK_SRC);
    click.volume = 0.5;
    clickRef.current = click;

    return () => {
      ambient.pause();
      ambient.src = '';
      click.src = '';
    };
  }, []);

  // Start ambient on first interaction (browser autoplay policy)
  const ensureAmbient = useCallback(() => {
    if (startedRef.current || !ambientRef.current) return;
    startedRef.current = true;
    ambientRef.current.play().catch(() => {
      // Autoplay blocked — will try again on next interaction
      startedRef.current = false;
    });
  }, []);

  const playClick = useCallback(() => {
    ensureAmbient();
    if (!clickRef.current) return;
    // Clone for overlapping clicks
    clickRef.current.currentTime = 0;
    clickRef.current.play().catch(() => {});
  }, [ensureAmbient]);

  // Attach a one-time listener to start ambient on first click/key
  useEffect(() => {
    const start = () => ensureAmbient();
    window.addEventListener('click', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('click', start);
      window.removeEventListener('keydown', start);
    };
  }, [ensureAmbient]);

  return { playClick };
}
