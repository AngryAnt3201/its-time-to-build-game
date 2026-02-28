import { Application, Graphics } from 'pixi.js';
import { Connection } from './network/connection';
import type { GameStateUpdate, PlayerInput, Vec2 } from './network/protocol';

async function init() {
  // ── PixiJS setup ────────────────────────────────────────────────
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  // ── Torch light (semi-transparent circle around the player) ─────
  const torchLight = new Graphics();
  torchLight.circle(0, 0, 120);
  torchLight.fill({ color: 0xffdd88, alpha: 0.08 });
  app.stage.addChild(torchLight);

  // ── Player graphic ──────────────────────────────────────────────
  const player = new Graphics();
  player.circle(0, 0, 8);
  player.fill(0x6688cc);
  player.x = 400;
  player.y = 300;
  app.stage.addChild(player);

  console.log('[client] PixiJS initialized');

  // ── Network connection ──────────────────────────────────────────
  const connection = new Connection('ws://127.0.0.1:9001');

  // Track the latest server state
  let latestState: GameStateUpdate | null = null;

  connection.onState((state: GameStateUpdate) => {
    latestState = state;
  });

  // ── Keyboard input tracking ─────────────────────────────────────
  const keys: Set<string> = new Set();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    keys.add(e.key.toLowerCase());
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  });

  // ── Game loop (runs every frame via PixiJS ticker) ──────────────
  let clientTick = 0;

  app.ticker.add(() => {
    clientTick++;

    // Build movement vector from pressed keys
    const movement: Vec2 = { x: 0, y: 0 };

    if (keys.has('w') || keys.has('arrowup')) movement.y = -1;
    if (keys.has('s') || keys.has('arrowdown')) movement.y = 1;
    if (keys.has('a') || keys.has('arrowleft')) movement.x = -1;
    if (keys.has('d') || keys.has('arrowright')) movement.x = 1;

    // Send input to server if there is movement
    if (movement.x !== 0 || movement.y !== 0) {
      const input: PlayerInput = {
        tick: clientTick,
        movement,
        action: null,
        target: null,
      };
      connection.sendInput(input);
    }

    // Update player position from server state
    if (latestState) {
      const pos = latestState.player.position;
      player.x = pos.x;
      player.y = pos.y;

      // Move torch light to follow player
      torchLight.x = pos.x;
      torchLight.y = pos.y;
    }
  });
}

init();
