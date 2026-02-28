import { createRoot } from 'react-dom/client';
import { TitleScreen } from './ui/title-screen/TitleScreen';
import { Application, Container, Graphics } from 'pixi.js';
import { Connection } from './network/connection';
import { EntityRenderer } from './renderer/entities';
import { WorldRenderer, isWalkable, TILE_PX } from './renderer/world';
import { LightingRenderer } from './renderer/lighting';
import { HUD } from './ui/hud';
import { AgentsHUD } from './ui/agents-hud';
import { InventoryHUD } from './ui/inventory-hud';
import { EquipmentHUD } from './ui/equipment-hud';
import { BuildHotbar } from './ui/build-hotbar';
import { LogFeed } from './ui/log-feed';
import { BuildMenu } from './ui/build-menu';
import { UpgradeTree } from './ui/upgrade-tree';
import { Grimoire } from './ui/grimoire';
import { DebugPanel } from './ui/debug-panel';
import { Minimap } from './ui/minimap';
import type { GameStateUpdate, PlayerInput, PlayerAction } from './network/protocol';
import { AudioManager } from './audio/manager';

async function startGame() {
  // Hide the React overlay
  const uiRoot = document.getElementById('ui-root')!;
  uiRoot.style.display = 'none';

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
  await worldRenderer.loadAssets();
  const lightingRenderer = new LightingRenderer(screenWidth, screenHeight);
  const entityRenderer = new EntityRenderer();
  const hud = new HUD();
  const agentsHud = new AgentsHUD();
  const inventoryHud = new InventoryHUD();
  const equipmentHud = new EquipmentHUD();
  const buildHotbar = new BuildHotbar();
  const logFeed = new LogFeed(screenWidth, screenHeight);
  const buildMenu = new BuildMenu();
  const upgradeTree = new UpgradeTree();
  const grimoire = new Grimoire();
  const debugPanel = new DebugPanel();
  const minimap = new Minimap();

  // ── Audio system ──────────────────────────────────────────────────
  const audioManager = new AudioManager();

  // Browser autoplay policy requires a user gesture before AudioContext
  // can start.  Init on the very first click or keydown, then remove
  // the listener so it only fires once.
  const initAudioOnGesture = () => {
    if (!audioManager.isInitialized) {
      audioManager.init().catch((err) =>
        console.warn('[audio] Failed to initialise:', err),
      );
    }
    window.removeEventListener('click', initAudioOnGesture);
    window.removeEventListener('keydown', initAudioOnGesture);
  };
  window.addEventListener('click', initAudioOnGesture);
  window.addEventListener('keydown', initAudioOnGesture);

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

  // ── World container (moves with camera, scaled for pixel art) ───
  const ZOOM = 3; // 3× zoom so 16 px pixel-art tiles are clearly visible
  const worldContainer = new Container();
  worldContainer.label = 'world-container';
  worldContainer.scale.set(ZOOM);
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
  uiContainer.addChild(agentsHud.container);
  uiContainer.addChild(equipmentHud.container);
  uiContainer.addChild(inventoryHud.container);
  uiContainer.addChild(buildHotbar.container);
  uiContainer.addChild(logFeed.container);
  uiContainer.addChild(buildMenu.container);
  uiContainer.addChild(upgradeTree.container);
  uiContainer.addChild(grimoire.container);
  uiContainer.addChild(debugPanel.container);
  uiContainer.addChild(minimap.container);
  uiContainer.addChild(equipmentHud.tooltipContainer); // tooltip on top of all UI
  uiContainer.addChild(agentsHud.tooltipContainer);    // agent tooltip on top of all UI

  // ── Add to stage in z-order ─────────────────────────────────────
  app.stage.addChild(worldContainer);
  app.stage.addChild(uiContainer);

  console.log('[client] PixiJS initialized with all renderers');

  // ── Initial layout for all UI elements ──────────────────────────
  buildMenu.resize(screenWidth, screenHeight);
  upgradeTree.resize(screenWidth, screenHeight);
  grimoire.resize(screenWidth, screenHeight);
  debugPanel.resize(screenWidth, screenHeight);
  buildHotbar.resize(screenWidth, screenHeight);
  equipmentHud.resize(screenWidth, screenHeight);
  inventoryHud.resize(screenWidth, screenHeight);
  minimap.resize(screenWidth, screenHeight);

  // ── Handle window resize ────────────────────────────────────────
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    lightingRenderer.resize(w, h);
    logFeed.resize(w, h);
    buildMenu.resize(w, h);
    upgradeTree.resize(w, h);
    grimoire.resize(w, h);
    debugPanel.resize(w, h);
    buildHotbar.resize(w, h);
    equipmentHud.resize(w, h);
    inventoryHud.resize(w, h);
    minimap.resize(w, h);
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

  // ── Build hotbar callback ──────────────────────────────────────
  buildHotbar.onSelect = (entry) => {
    // Enter placement mode via the build menu's placement system
    buildMenu.placementBuilding = {
      type: entry.type,
      name: entry.name,
      cost: entry.cost,
      description: '',
      tier: 0,
    };
    buildMenu.placementMode = true;

    // Draw the ghost outline
    const ghost = buildMenu.ghostGraphic;
    ghost.clear();
    ghost.rect(-16, -16, 32, 32);
    ghost.stroke({ color: 0xd4a017, alpha: 0.6, width: 2 });
    ghost.rect(-16, -16, 32, 32);
    ghost.fill({ color: 0xd4a017, alpha: 0.15 });
    ghost.visible = true;
  };

  // ── Debug panel callback ──────────────────────────────────────
  debugPanel.onAction = (action: PlayerAction) => {
    const input: PlayerInput = {
      tick: clientTick,
      movement: { x: 0, y: 0 },
      action,
      target: null,
    };
    connection.sendInput(input);
  };

  debugPanel.onToggleBoundaries = () => {
    worldRenderer.toggleDebugBoundaries();
  };

  // ── Default equipment loadout ──────────────────────────────────
  equipmentHud.equipWeapon('shortsword');
  equipmentHud.equipArmour('cloth');

  // ── Mouse tracking for placement mode ─────────────────────────
  let mouseScreenX = 0;
  let mouseScreenY = 0;

  app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
    mouseScreenX = e.clientX;
    mouseScreenY = e.clientY;

    if (buildMenu.placementMode) {
      // Convert screen coords to world coords (accounting for zoom)
      const worldX = (mouseScreenX - worldContainer.x) / ZOOM;
      const worldY = (mouseScreenY - worldContainer.y) / ZOOM;
      buildMenu.updateGhostPosition(worldX, worldY);
    }
  });

  app.canvas.addEventListener('click', (e: MouseEvent) => {
    if (buildMenu.placementMode) {
      const worldX = (e.clientX - worldContainer.x) / ZOOM;
      const worldY = (e.clientY - worldContainer.y) / ZOOM;
      buildMenu.confirmPlacement(worldX, worldY);
      buildHotbar.clearSelection();
    }
  });

  app.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    if (buildMenu.placementMode) {
      e.preventDefault();
      buildMenu.cancelPlacement();
      buildHotbar.clearSelection();
    }
  });

  // ── Keyboard input tracking ─────────────────────────────────────
  const keys: Set<string> = new Set();
  let crankActive = false;

  // Track keys that should fire once on press (not held)
  const justPressed: Set<string> = new Set();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();

    // ── Debug panel key handling (backtick toggles) ───────────────
    if (key === '`') {
      debugPanel.toggle();
      return;
    }

    if (debugPanel.visible) {
      if (key === 'escape') {
        debugPanel.close();
        return;
      }
      return;
    }

    // ── Grimoire key handling (intercept before other menus) ──────
    if (key === 'g' && !buildMenu.visible && !upgradeTree.visible) {
      grimoire.toggle();
      return;
    }

    if (grimoire.visible) {
      if (key === 'arrowup' || key === 'w') {
        grimoire.scrollPrev();
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        grimoire.scrollNext();
        return;
      }
      if (key === 'escape' || key === 'g') {
        grimoire.close();
        return;
      }
      return;
    }

    // ── Minimap key handling ─────────────────────────────────────────
    if (key === 'm' && !buildMenu.visible && !upgradeTree.visible && !grimoire.visible) {
      minimap.toggle();
      return;
    }

    if (minimap.expanded) {
      if (key === 'escape') {
        minimap.close();
        return;
      }
      return;
    }

    // ── Upgrade tree key handling (intercept before normal input) ──
    if (key === 'u' && !buildMenu.visible) {
      upgradeTree.toggle();
      return;
    }

    if (upgradeTree.visible) {
      if (key === 'arrowup' || key === 'w') {
        upgradeTree.selectPrev();
        return;
      }
      if (key === 'arrowdown' || key === 's') {
        upgradeTree.selectNext();
        return;
      }
      if (key === 'enter') {
        upgradeTree.confirmSelection();
        return;
      }
      if (key === 'escape') {
        upgradeTree.close();
        return;
      }
      return;
    }

    // ── Build menu key handling (intercept before normal input) ───
    if (key === 'b') {
      buildMenu.toggle();
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
      return;
    }

    if (buildMenu.placementMode) {
      if (key === 'escape') {
        buildMenu.cancelPlacement();
        buildHotbar.clearSelection();
        return;
      }
    }

    // ── Build hotbar number keys (1-7) ───────────────────────────
    if (key >= '1' && key <= '7') {
      const entry = buildHotbar.selectByKey(key);
      if (entry) {
        // selectByKey triggers onSelect which enters placement mode
        return;
      }
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

    // Block movement and actions while any overlay is open
    const menuBlocking = buildMenu.visible || upgradeTree.visible || grimoire.visible || debugPanel.visible || minimap.expanded;

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
      if (justPressed.has(' ')) {
        action = 'Attack';
      }

      if (justPressed.has('e')) {
        crankActive = !crankActive;
        action = crankActive ? 'CrankStart' : 'CrankStop';
      }
    }

    // Clear just-pressed keys
    justPressed.clear();

    // ── Collision: block movement into water/cliffs ──────────────
    // Check each axis independently for wall-sliding behavior.
    const PLAYER_SPEED = 3.0; // must match server PLAYER_SPEED
    if (movement.x !== 0 || movement.y !== 0) {
      const len = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
      const dx = (movement.x / len) * PLAYER_SPEED;
      const dy = (movement.y / len) * PLAYER_SPEED;
      const px = player.x;
      const py = player.y;

      // Check X movement
      const futureXtile = Math.floor((px + dx) / TILE_PX);
      const curYtile = Math.floor(py / TILE_PX);
      if (!isWalkable(futureXtile, curYtile)) {
        movement.x = 0;
      }

      // Check Y movement
      const curXtile = Math.floor(px / TILE_PX);
      const futureYtile = Math.floor((py + dy) / TILE_PX);
      if (!isWalkable(curXtile, futureYtile)) {
        movement.y = 0;
      }

      // Check diagonal (both axes moving)
      if (movement.x !== 0 && movement.y !== 0) {
        const diagTx = Math.floor((px + dx) / TILE_PX);
        const diagTy = Math.floor((py + dy) / TILE_PX);
        if (!isWalkable(diagTx, diagTy)) {
          // Block the less important axis (keep the primary direction)
          if (Math.abs(movement.x) >= Math.abs(movement.y)) {
            movement.y = 0;
          } else {
            movement.x = 0;
          }
        }
      }
    }

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

    // ── Update visible terrain chunks around the player ──────────
    worldRenderer.updateVisibleChunks(player.x, player.y);

    // ── Update from server state ──────────────────────────────────
    if (latestState) {
      const state = latestState;

      // Update player position
      const pos = state.player.position;
      player.x = pos.x;
      player.y = pos.y;

      // ── Camera: center world container on player (accounting for zoom)
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      worldContainer.x = halfW - pos.x * ZOOM;
      worldContainer.y = halfH - pos.y * ZOOM;

      // Update torch light position and radius
      torchLight.x = pos.x;
      torchLight.y = pos.y;

      if (state.player.torch_range > 0) {
        lightingRenderer.updateTorchLight(pos.x, pos.y, state.player.torch_range);
      }

      // Update entity renderer with changed/removed entities
      entityRenderer.update(state.entities_changed, state.entities_removed);

      // Update grimoire with agent data from entity deltas
      grimoire.update(state.entities_changed);

      // Update agents HUD with entity deltas
      agentsHud.update(state.entities_changed);
      if (state.entities_removed.length > 0) {
        agentsHud.removeAgents(state.entities_removed);
      }

      // Update HUD with player snapshot and economy
      hud.update(state.player, state.economy);

      // Update debug panel with live server state
      debugPanel.updateState(state.debug);

      // Add new log entries to log feed (only process new ticks)
      if (state.tick > previousTick && state.log_entries.length > 0) {
        logFeed.addEntries(state.log_entries);
      }

      // ── Audio: update listener position and play triggered events ──
      audioManager.setListenerPosition(pos.x, pos.y);

      if (state.tick > previousTick && state.audio_triggers.length > 0) {
        audioManager.handleAudioEvents(state.audio_triggers);
      }

      // Update minimap with player position and all known entities
      minimap.update(pos.x, pos.y, state.entities_changed, state.entities_removed);

      previousTick = state.tick;
    }
  });
}

// Mount React title screen
const uiRoot = document.getElementById('ui-root')!;
const root = createRoot(uiRoot);
root.render(<TitleScreen onPlay={() => startGame()} />);
