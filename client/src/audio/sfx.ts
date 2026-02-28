// ── Sound Effects Player ───────────────────────────────────────────
// Synthesized placeholder sounds using Web Audio API oscillators.
// Each SFXType maps to a distinct waveform / frequency / duration so
// the game already feels responsive before real assets are recorded.

export type SFXType =
  | 'combat_hit'
  | 'build_complete'
  | 'rogue_spawn'
  | 'crank_turn'
  | 'agent_death'
  | 'token_gain'
  | 'error';

/**
 * Calculate distance-based volume attenuation.
 * volume = 1.0 / (1.0 + distance / 200.0)
 */
function attenuate(x: number, y: number, lx: number, ly: number): number {
  const dx = x - lx;
  const dy = y - ly;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return 1.0 / (1.0 + distance / 200.0);
}

export class SFXPlayer {
  private ctx: AudioContext;
  private destination: AudioNode;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  /**
   * Play a synthesized sound effect at a world position.
   * Volume is attenuated based on distance from the listener.
   */
  play(
    type: SFXType,
    x: number,
    y: number,
    listenerX: number,
    listenerY: number,
  ): void {
    const volume = attenuate(x, y, listenerX, listenerY);
    if (volume < 0.01) return; // too far away to hear

    switch (type) {
      case 'combat_hit':
        this.playCombatHit(volume);
        break;
      case 'build_complete':
        this.playBuildComplete(volume);
        break;
      case 'rogue_spawn':
        this.playRogueSpawn(volume);
        break;
      case 'crank_turn':
        this.playCrankTurn(volume);
        break;
      case 'agent_death':
        this.playAgentDeath(volume);
        break;
      case 'token_gain':
        this.playTokenGain(volume);
        break;
      case 'error':
        this.playError(volume);
        break;
    }
  }

  // ── Individual sound synthesisers ──────────────────────────────────

  /** Short burst, 200 Hz square wave, 50 ms */
  private playCombatHit(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 200;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /** Ascending two-tone chime, 440 Hz -> 660 Hz sine, 200 ms total */
  private playBuildComplete(volume: number): void {
    const now = this.ctx.currentTime;

    // First tone: 440 Hz for 100 ms
    const g1 = this.makeGain(volume);
    g1.gain.setValueAtTime(volume, now);
    g1.gain.linearRampToValueAtTime(0, now + 0.1);
    const o1 = this.ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 440;
    o1.connect(g1);
    o1.start(now);
    o1.stop(now + 0.1);

    // Second tone: 660 Hz for 100 ms, starts at 100 ms offset
    const g2 = this.makeGain(0);
    g2.gain.setValueAtTime(0, now);
    g2.gain.setValueAtTime(volume, now + 0.1);
    g2.gain.linearRampToValueAtTime(0, now + 0.2);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 660;
    o2.connect(g2);
    o2.start(now + 0.1);
    o2.stop(now + 0.2);
  }

  /** Low rumble, 80 Hz sawtooth, 300 ms */
  private playRogueSpawn(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.3);

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 80;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Mechanical click — white noise burst, 30 ms */
  private playCrankTurn(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.03);

    // White noise via a buffer source
    const bufferSize = Math.ceil(this.ctx.sampleRate * 0.03);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.connect(gain);
    noise.start(now);
    noise.stop(now + 0.03);
  }

  /** Descending tone, 440 Hz -> 110 Hz, 500 ms */
  private playAgentDeath(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.5);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** Soft high chime, 880 Hz sine, 100 ms */
  private playTokenGain(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume * 0.6); // softer
    gain.gain.setValueAtTime(volume * 0.6, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.1);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /** Harsh buzz, 150 Hz square wave, 200 ms */
  private playError(volume: number): void {
    const now = this.ctx.currentTime;
    const gain = this.makeGain(volume);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.2);

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 150;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /** Create a gain node connected to the main destination. */
  private makeGain(initialVolume: number): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = initialVolume;
    gain.connect(this.destination);
    return gain;
  }
}
