// ── Ambient Audio ──────────────────────────────────────────────────
// Continuous background music during gameplay.
// Plays ambient_gameplay.mp3 on loop at low volume.

const AMBIENT_GAMEPLAY_SRC = '/ambient_gameplay.mp3';

export class AmbientAudio {
  private audio: HTMLAudioElement | null = null;
  private gainNode: GainNode | null = null;
  private source: MediaElementAudioSourceNode | null = null;

  /**
   * Start the ambient gameplay music, routed through the Web Audio graph
   * so it respects the master gain chain.
   */
  startServerHum(ctx: AudioContext, destination: AudioNode): void {
    if (this.audio) return; // already running

    this.audio = new Audio(AMBIENT_GAMEPLAY_SRC);
    this.audio.loop = true;
    this.audio.volume = 1; // volume controlled via gain node

    // Route through Web Audio API for master volume control
    this.source = ctx.createMediaElementSource(this.audio);
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.08; // quiet ambient level
    this.source.connect(this.gainNode);
    this.gainNode.connect(destination);

    this.audio.play().catch(() => {
      // Autoplay may be blocked; will start once context resumes
    });
  }

  /** Stop the ambient music gracefully. */
  stopServerHum(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }
}
