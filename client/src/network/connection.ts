import { encode, decode } from '@msgpack/msgpack';
import type { GameStateUpdate, PlayerInput } from './protocol';

/**
 * WebSocket connection to the game server.
 *
 * Handles binary msgpack serialization/deserialization and provides a
 * simple callback-based API for receiving state updates and sending input.
 */
export class Connection {
  private ws: WebSocket;
  private stateCallback: ((state: GameStateUpdate) => void) | null = null;
  private _connected = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.addEventListener('open', () => {
      console.log('[network] Connected to server');
      this._connected = true;
    });

    this.ws.addEventListener('close', () => {
      console.log('[network] Disconnected from server');
      this._connected = false;
    });

    this.ws.addEventListener('error', (e) => {
      console.error('[network] WebSocket error:', e);
    });

    this.ws.addEventListener('message', (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        try {
          const state = decode(new Uint8Array(event.data)) as GameStateUpdate;
          if (this.stateCallback) {
            this.stateCallback(state);
          }
        } catch (err) {
          console.error('[network] Failed to decode GameStateUpdate:', err);
        }
      }
    });
  }

  /** Register a callback that fires every time a GameStateUpdate arrives. */
  onState(callback: (state: GameStateUpdate) => void): void {
    this.stateCallback = callback;
  }

  /** Encode and send a PlayerInput to the server. */
  sendInput(input: PlayerInput): void {
    if (this._connected && this.ws.readyState === WebSocket.OPEN) {
      const bytes = encode(input);
      this.ws.send(bytes);
    }
  }

  /** Whether the WebSocket is currently open. */
  get connected(): boolean {
    return this._connected;
  }
}
