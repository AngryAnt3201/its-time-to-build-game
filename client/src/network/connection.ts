import { encode, decode } from '@msgpack/msgpack';
import type { GameStateUpdate, PlayerInput, ServerMessage } from './protocol';

export class Connection {
  private ws: WebSocket;
  private stateCallback: ((state: GameStateUpdate) => void) | null = null;
  private vibeOutputCallback: ((agentId: number, data: Uint8Array) => void) | null = null;
  private vibeSessionCallback: ((event: { type: 'started' | 'ended'; agentId: number; reason?: string }) => void) | null = null;
  private gradeResultCallback: ((buildingId: string, stars: number, reasoning: string) => void) | null = null;
  private _connected = false;
  private pendingQueue: Uint8Array[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.addEventListener('open', () => {
      console.log('[network] Connected to server');
      this._connected = true;
      for (const bytes of this.pendingQueue) {
        this.ws.send(bytes);
      }
      this.pendingQueue = [];
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
          const msg = decode(new Uint8Array(event.data)) as ServerMessage;

          if ('GameState' in msg) {
            if (this.stateCallback) {
              this.stateCallback(msg.GameState);
            }
          } else if ('VibeOutput' in msg) {
            if (this.vibeOutputCallback) {
              this.vibeOutputCallback(
                msg.VibeOutput.agent_id,
                new Uint8Array(msg.VibeOutput.data),
              );
            }
          } else if ('VibeSessionStarted' in msg) {
            if (this.vibeSessionCallback) {
              this.vibeSessionCallback({
                type: 'started',
                agentId: msg.VibeSessionStarted.agent_id,
              });
            }
          } else if ('VibeSessionEnded' in msg) {
            if (this.vibeSessionCallback) {
              this.vibeSessionCallback({
                type: 'ended',
                agentId: msg.VibeSessionEnded.agent_id,
                reason: msg.VibeSessionEnded.reason,
              });
            }
          } else if ('GradeResult' in msg) {
            if (this.gradeResultCallback) {
              this.gradeResultCallback(
                msg.GradeResult.building_id,
                msg.GradeResult.stars,
                msg.GradeResult.reasoning,
              );
            }
          }
        } catch (err) {
          console.error('[network] Failed to decode ServerMessage:', err);
        }
      }
    });
  }

  onState(callback: (state: GameStateUpdate) => void): void {
    this.stateCallback = callback;
  }

  onVibeOutput(callback: (agentId: number, data: Uint8Array) => void): void {
    this.vibeOutputCallback = callback;
  }

  onVibeSession(callback: (event: { type: 'started' | 'ended'; agentId: number; reason?: string }) => void): void {
    this.vibeSessionCallback = callback;
  }

  onGradeResult(callback: (buildingId: string, stars: number, reasoning: string) => void): void {
    this.gradeResultCallback = callback;
  }

  sendInput(input: PlayerInput): void {
    const bytes = encode(input);
    if (this._connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(bytes);
    } else {
      this.pendingQueue.push(bytes as Uint8Array);
    }
  }

  get connected(): boolean {
    return this._connected;
  }
}
