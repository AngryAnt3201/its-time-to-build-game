// ── Audio Manager ──────────────────────────────────────────────────
// Central hub that owns the Web Audio API context and coordinates
// ambient layers, sound effects, and voice playback.

import type { AudioEvent } from '../network/protocol';
import { AmbientAudio } from './ambient';
import { SFXPlayer, type SFXType } from './sfx';
import { VoiceManager, PlaceholderVoiceProvider } from './voice';

/**
 * Map server-sent AudioEvent strings to the SFXType used by SFXPlayer.
 * "AgentSpeak" is handled separately via the VoiceManager.
 */
const AUDIO_EVENT_TO_SFX: Record<string, SFXType | null> = {
  CombatHit: 'combat_hit',
  BuildComplete: 'build_complete',
  RogueSpawn: 'rogue_spawn',
  CrankTurn: 'crank_turn',
  AgentDeath: 'agent_death',
  AgentSpeak: null, // routed to VoiceManager instead
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambient: AmbientAudio;
  private sfx: SFXPlayer | null = null;
  private voice: VoiceManager | null = null;
  private muted = false;
  private masterVolume = 0.5;
  private initialized = false;

  // Listener world-space position (updated each frame)
  private listenerX = 0;
  private listenerY = 0;

  constructor() {
    this.ambient = new AmbientAudio();
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Initialise the AudioContext.
   * Must be called after a user gesture (click / keydown) to satisfy
   * browser autoplay policies.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.ctx = new AudioContext();

    // Master gain node — everything routes through here
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterGain.connect(this.ctx.destination);

    // Sub-systems
    this.sfx = new SFXPlayer(this.ctx, this.masterGain);
    this.voice = new VoiceManager(this.ctx, this.masterGain);
    this.voice.setProvider(new PlaceholderVoiceProvider());

    // Start ambient layers
    this.ambient.startServerHum(this.ctx, this.masterGain);

    this.initialized = true;
    console.log('[audio] AudioManager initialised');
  }

  /** Whether the audio context has been started. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  // ── Spatial listener ─────────────────────────────────────────────

  /** Update the listener position (typically the player's world coords). */
  setListenerPosition(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  // ── Event processing ─────────────────────────────────────────────

  /**
   * Process audio events emitted by the server this tick.
   * Each event is played at the listener position (we don't have per-event
   * coordinates from the server yet, so they play non-spatially).
   */
  handleAudioEvents(events: AudioEvent[]): void {
    if (!this.initialized || !this.sfx) return;

    for (const event of events) {
      const sfxType = AUDIO_EVENT_TO_SFX[event];

      if (sfxType) {
        // Play at listener position (full volume — no attenuation)
        this.sfx.play(sfxType, this.listenerX, this.listenerY, this.listenerX, this.listenerY);
      }
      // AgentSpeak would go through this.voice — currently a no-op
    }
  }

  // ── Volume controls ──────────────────────────────────────────────

  /** Set master volume (0.0 – 1.0). */
  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    }
  }

  /** Toggle mute on / off. */
  toggleMute(): void {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    }
  }

  /** Expose the VoiceManager so callers can swap providers. */
  getVoiceManager(): VoiceManager | null {
    return this.voice;
  }
}
