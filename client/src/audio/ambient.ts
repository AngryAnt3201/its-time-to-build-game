// ── Ambient Audio ──────────────────────────────────────────────────
// Continuous background audio layers (e.g., server-room hum).
// Uses Web Audio API oscillators as placeholders until real assets exist.

export class AmbientAudio {
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;

  /**
   * Start a subtle 60 Hz sine-wave hum that evokes a server room.
   * Very quiet so it sits under everything else.
   */
  startServerHum(ctx: AudioContext, destination: AudioNode): void {
    if (this.humOsc) return; // already running

    // Gain envelope — keep it barely audible
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.04;
    this.humGain.connect(destination);

    // 60 Hz sine oscillator
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = 'sine';
    this.humOsc.frequency.value = 60;
    this.humOsc.connect(this.humGain);
    this.humOsc.start();
  }

  /** Stop the server-room hum gracefully. */
  stopServerHum(): void {
    if (this.humOsc) {
      this.humOsc.stop();
      this.humOsc.disconnect();
      this.humOsc = null;
    }
    if (this.humGain) {
      this.humGain.disconnect();
      this.humGain = null;
    }
  }
}
