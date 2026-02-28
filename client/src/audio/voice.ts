// ── Voice System ───────────────────────────────────────────────────
// Pluggable voice interface for agent speech.
// Ships with a silent placeholder; a real provider (e.g. ElevenLabs)
// can be swapped in later without touching the rest of the audio stack.

/** Any voice backend must implement this interface. */
export interface VoiceProvider {
  /** Generate or retrieve a voice line for an agent. */
  getLine(agentId: number, category: string): Promise<AudioBuffer | null>;
}

/**
 * Placeholder provider that produces no audio.
 * Voice functionality will be wired up in a future task.
 */
export class PlaceholderVoiceProvider implements VoiceProvider {
  async getLine(_agentId: number, _category: string): Promise<AudioBuffer | null> {
    return null; // No voice yet
  }
}

/**
 * Calculate distance-based volume attenuation for voice lines.
 */
function attenuateVoice(x: number, y: number, lx: number, ly: number): number {
  const dx = x - lx;
  const dy = y - ly;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return 1.0 / (1.0 + distance / 200.0);
}

/**
 * Manages voice playback for agents.
 * Accepts any VoiceProvider and plays returned AudioBuffers with spatial
 * attenuation relative to the listener.
 */
export class VoiceManager {
  private provider: VoiceProvider | null = null;
  private ctx: AudioContext;
  private destination: AudioNode;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  /** Set (or replace) the active voice provider. */
  setProvider(provider: VoiceProvider): void {
    this.provider = provider;
  }

  /**
   * Request and play a voice line for the given agent at a world position.
   * If the provider returns null the call is silently ignored.
   */
  async playAgentLine(
    agentId: number,
    category: string,
    x: number,
    y: number,
    listenerX: number,
    listenerY: number,
  ): Promise<void> {
    if (!this.provider) return;

    const buffer = await this.provider.getLine(agentId, category);
    if (!buffer) return;

    const volume = attenuateVoice(x, y, listenerX, listenerY);
    if (volume < 0.01) return; // too far away

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    gain.connect(this.destination);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
  }
}
