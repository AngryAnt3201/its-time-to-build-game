import { Application, Container, Graphics } from 'pixi.js';
import { Connection } from './network/connection';
import { EntityRenderer } from './renderer/entities';
import { WorldRenderer } from './renderer/world';
import { LightingRenderer } from './renderer/lighting';
import { HUD } from './ui/hud';
import { LogFeed } from './ui/log-feed';
import { BuildMenu } from './ui/build-menu';
import type { GameStateUpdate, PlayerInput, PlayerAction } from './network/protocol';

async function init() {
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;

  // ── PixiJS setup ────────────────────────────────────────────────
  const app = new Application();
  await app.init({
    width: screenWidth,
    height: screenHeight,
    backgroundColor: 0x0a0a0a,
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  // ── Create renderers and UI ─────────────────────────────────────
  const worldRenderer = new WorldRenderer();
  const lightingRenderer = new LightingRenderer(screenWidth, screenHeight);
  const entityRenderer = new EntityRenderer();
  const hud = new HUD();
  const logFeed = new LogFeed(screenWidth, screenHeight);
  const buildMenu = new BuildMenu();

  // ── Torch light (semi-transparent circle around the player) ─────
  const torchLight = new Graphics();
  torchLight.circle(0, 0, 120);
  torchLight.fill({ color: 0xffdd88, alpha: 0.08 });

  // ── Player graphic ──────────────────────────────────────────────
  const player = new Graphics();
  player.circle(0, 0, 8);
  player.fill(0x6688cc);
  player.x = 400;
  player.y = 300;

  // ── World container (moves with camera) ─────────────────────────
  const worldContainer = new Container();
  worldContainer.label = 'world-container';
  worldContainer.addChild(worldRenderer.container);   // bottom: terrain
  worldContainer.addChild(lightingRenderer.container); // darkness overlay
  worldContainer.addChild(entityRenderer.container);   // entities
  worldContainer.addChild(player);                     // player on top
  worldContainer.addChild(torchLight);                 // torch glow
  worldContainer.addChild(buildMenu.ghostGraphic);     // placement ghost

  // ── UI container (fixed on screen, does not move with camera) ───
  const uiContainer = new Container();
  uiContainer.label = 'ui-container';
  uiContainer.addChild(hud.container);
  uiContainer.addChild(logFeed.container);
  uiContainer.addChild(buildMenu.container);

  // ── Add to stage in z-order ─────────────────────────────────────
  app.stage.addChild(worldContainer);
  app.stage.addChild(uiContainer);

  console.log('[client] PixiJS initialized with all renderers');

  // ── Initial layout for build menu ─────────────────────────────────
  buildMenu.resize(screenWidth, screenHeight);

  // ── Handle window resize ────────────────────────────────────────
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    lightingRenderer.resize(w, h);
    logFeed.resize(w, h);
    buildMenu.resize(w, h);
  });

  // ── Network connection ──────────────────────────────────────────
  const connection = new Connection('ws://127.0.0.1:9001');

  // Track the latest server state
  let latestState: GameStateUpdate | null = null;
  let previousTick = 0;

  connection.onState((state: GameStateUpdate) => {
    latestState = state;
  });

  // ── Client tick counter (used by both game loop and callbacks) ──
  let clientTick = 0;

  // ── Build menu callback ────────────────────────────────────────
  buildMenu.onPlace = (buildingType, x, y) => {
    const action: PlayerAction = {
      PlaceBuilding: { building_type: buildingType, x, y },
    };
    const input: PlayerInput = {
      tick: clientTick,
      movement: { x: 0, y: 0 },
      action,
      target: null,
    };
    connection.sendInput(input);
    console.log(`[client] Placing ${buildingType} at (${x}, ${y})`);
  };

  // ── Mouse tracking for placement mode ─────────────────────────
  let mouseScreenX = 0;
  let mouseScreenY = 0;

  app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
    mouseScreenX = e.clientX;
    mouseScreenY = e.clientY;

    if (buildMenu.placementMode) {
      // Convert screen coords to world coords
      const worldX = mouseScreenX - worldContainer.x;
      const worldY = mouseScreenY - worldContainer.y;
      buildMenu.updateGhostPosition(worldX, worldY);
    }
  });

  app.canvas.addEventListener('click', (e: MouseEvent) => {
    if (buildMenu.placementMode) {
      const worldX = e.clientX - worldContainer.x;
      const worldY = e.clientY - worldContainer.y;
      buildMenu.confirmPlacement(worldX, worldY);
    }
  });

  app.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    if (buildMenu.placementMode) {
      e.preventDefault();
      buildMenu.cancelPlacement();
    }
  });

  // ── Keyboard input tracking ─────────────────────────────────────
  const keys: Set<string> = new Set();
  let crankActive = false;

  // Track keys that should fire once on press (not held)
  const justPressed: Set<string> = new Set();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();

    // ── Build menu key handling (intercept before normal input) ───
    if (key === 'b') {
      buildMenu.toggle();
      // Don't add to keys/justPressed — build menu handles it
      return;
    }

    if (buildMenu.visible) {
      if (key === 'arrowup' || key === 'w') {
        buildMenu.selectPrev();
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        buildMenu.selectNext();
        return;
      }
      if (key === 'enter') {
        buildMenu.confirmSelection();
        return;
      }
      if (key === 'escape') {
        buildMenu.close();
        return;
      }
      // Swallow all other keys while menu is open
      return;
    }

    if (buildMenu.placementMode) {
      if (key === 'escape') {
        buildMenu.cancelPlacement();
        return;
      }
      // Allow movement during placement mode but intercept menu keys
    }

    if (!keys.has(key)) {
      justPressed.add(key);
    }
    keys.add(key);
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  });

  // ── Game loop (runs every frame via PixiJS ticker) ──────────────
  app.ticker.add(() => {
    clientTick++;

    // Block movement and actions while build menu is open
    const menuBlocking = buildMenu.visible;

    // Build movement vector from pressed keys
    const movement = { x: 0, y: 0 };

    if (!menuBlocking) {
      if (keys.has('w') || keys.has('arrowup')) movement.y = -1;
      if (keys.has('s') || keys.has('arrowdown')) movement.y = 1;
      if (keys.has('a') || keys.has('arrowleft')) movement.x = -1;
      if (keys.has('d') || keys.has('arrowright')) movement.x = 1;
    }

    // Determine action for this frame
    let action: PlayerAction | null = null;

    if (!menuBlocking) {
      // Space key = Attack (fires each frame while held, or once on press)
      if (justPressed.has(' ')) {
        action = 'Attack';
      }

      // E key = toggle crank
      if (justPressed.has('e')) {
        crankActive = !crankActive;
        action = crankActive ? 'CrankStart' : 'CrankStop';
      }
    }

    // Clear just-pressed keys
    justPressed.clear();

    // Send input to server if there is movement or an action
    if (movement.x !== 0 || movement.y !== 0 || action !== null) {
      const input: PlayerInput = {
        tick: clientTick,
        movement,
        action,
        target: null,
      };
      connection.sendInput(input);
    }

    // ── Update from server state ──────────────────────────────────
    if (latestState) {
      const state = latestState;

      // Update player position
      const pos = state.player.position;
      player.x = pos.x;
      player.y = pos.y;

      // Update torch light position and radius
      torchLight.x = pos.x;
      torchLight.y = pos.y;

      // Redraw torch light if radius changed
      if (state.player.torch_range > 0) {
        lightingRenderer.updateTorchLight(pos.x, pos.y, state.player.torch_range);
      }

      // Update entity renderer with changed/removed entities
      entityRenderer.update(state.entities_changed, state.entities_removed);

      // Update HUD with player snapshot and economy
      hud.update(state.player, state.economy);

      // Add new log entries to log feed (only process new ticks)
      if (state.tick > previousTick && state.log_entries.length > 0) {
        logFeed.addEntries(state.log_entries);
      }

      previousTick = state.tick;
    }
  });
}

init();
