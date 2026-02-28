import { createRoot } from 'react-dom/client';
import { TitleScreen } from './ui/title-screen/TitleScreen';
import { Application, Container, Graphics } from 'pixi.js';
import { Connection } from './network/connection';
import { EntityRenderer } from './renderer/entities';
import { WorldRenderer, isWalkable, TILE_PX } from './renderer/world';
import { LightingRenderer, type LightSource } from './renderer/lighting';
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
import { BuildingPanel } from './ui/building-panel';
import { Minimap } from './ui/minimap';
import { HotbarTooltip } from './ui/hotbar-tooltip';
import { BuildingToolbar } from './ui/building-toolbar';
import { DeathScreen } from './ui/death-screen';
import { TerminalOverlay } from './ui/terminal-overlay';
import { AgentWorldTooltip, type AgentWorldData } from './ui/agent-world-tooltip';
import { CombatVFX } from './renderer/combat-vfx';
import { ALL_BUILDINGS, TIER_NAMES, buildingTypeToId as buildingIdFromType } from './data/buildings';
import type { GameStateUpdate, PlayerInput, PlayerAction, EntityDelta, BuildingTypeKind } from './network/protocol';
import { AudioManager } from './audio/manager';
import { getProjectDir, getProjectInitFlag, setProjectInitFlag } from './utils/project-settings';
import { getApiKey } from './utils/api-keys';

// ── Building light source lookup ─────────────────────────────────────
// Maps building types to their light radius (in world pixels).
// Only buildings that emit light are listed here.
// Must be kept in sync with server/src/game/building.rs definitions.
const BUILDING_LIGHT_RADIUS: Partial<Record<BuildingTypeKind, number>> = {
  Pylon: 200,
  ChatApp: 60,
  AiImageGenerator: 80,
  Blockchain: 70,
};

/** Convert PascalCase building type to snake_case building ID. */
function buildingTypeToId(type: string): string {
  return type.replace(/([A-Z])/g, (_, p1: string, offset: number) =>
    offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase(),
  );
}

/** Convert PascalCase building type to Title Case display name. */
function buildingTypeToName(type: string): string {
  return type.replace(/([A-Z])/g, ' $1').trim();
}

/** Check if any building matching `buildingId` is within range of a completed Pylon. */
function isBuildingNearPylon(buildingId: string, entityMap: Map<number, EntityDelta>): boolean {
  const pylons: { x: number; y: number }[] = [];
  const targets: { x: number; y: number }[] = [];

  for (const entity of entityMap.values()) {
    if (entity.kind !== 'Building') continue;
    const data = (entity.data as { Building?: { building_type: string; construction_pct: number } }).Building;
    if (!data || data.construction_pct < 1.0) continue;
    if (data.building_type === 'Pylon') {
      pylons.push(entity.position);
    }
    const entityBuildingId = buildingIdFromType(data.building_type);
    if (entityBuildingId === buildingId) {
      targets.push(entity.position);
    }
  }

  if (targets.length === 0 || pylons.length === 0) return false;

  const PYLON_RANGE = 200;
  for (const target of targets) {
    for (const pylon of pylons) {
      const dx = target.x - pylon.x;
      const dy = target.y - pylon.y;
      if (dx * dx + dy * dy <= PYLON_RANGE * PYLON_RANGE) return true;
    }
  }
  return false;
}

async function startGame() {
  // Keep the React overlay visible — it shows a loading screen.
  // We hide it once the server confirms project initialization is complete.
  const uiRoot = document.getElementById('ui-root')!;

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
  const hotbarTooltip = new HotbarTooltip();

  // ── Persistent entity map (tracks buildings across ticks) ─────────
  const entityMap: Map<number, EntityDelta> = new Map();

  // ── Building counts cache (for tooltip cost display) ──────────────
  let buildingCountsCache: Map<BuildingTypeKind, number> = new Map();

  // ── Building interaction panel ────────────────────────────────────
  // Connection is not yet created here, so we use a forwarding closure
  // that captures the variable once it's assigned below.
  let connectionRef: Connection | null = null;
  let clientTickRef = 0;

  const buildingPanel = new BuildingPanel({
    onAction: (action) => {
      connectionRef?.sendInput({
        tick: clientTickRef,
        movement: { x: 0, y: 0 },
        action,
        target: null,
      });
    },
    onClose: () => {
      // Nothing needed — panel manages its own visibility
    },
  });

  // ── Building hover toolbar ──────────────────────────────────────────
  /** Collect all idle agents for the picker dropdown. */
  function getIdleAgents(): { id: number; name: string; tier: string }[] {
    const agents: { id: number; name: string; tier: string }[] = [];
    for (const entity of entityMap.values()) {
      if (entity.kind !== 'Agent') continue;
      const data = (entity.data as { Agent?: { state: string; name: string; tier: string } }).Agent;
      if (!data || data.state !== 'Idle') continue;
      agents.push({ id: entity.id, name: data.name, tier: data.tier });
    }
    return agents;
  }

  const buildingToolbar = new BuildingToolbar({
    onAssignAgent: (buildingId, agentId) => {
      connectionRef?.sendInput({
        tick: clientTickRef,
        movement: { x: 0, y: 0 },
        action: { AssignAgentToProject: { agent_id: agentId, building_id: buildingId } },
        target: null,
      });
    },
    onUnassignAgent: (buildingId, agentId) => {
      connectionRef?.sendInput({
        tick: clientTickRef,
        movement: { x: 0, y: 0 },
        action: { UnassignAgentFromProject: { agent_id: agentId, building_id: buildingId } },
        target: null,
      });
    },
    onOpenApp: (buildingId) => {
      buildingToolbar.hide();
      const name = buildingTypeToName(buildingId.replace(/_./g, m => m[1].toUpperCase()).replace(/^./, c => c.toUpperCase()));
      const status = latestState?.project_manager?.building_statuses?.[buildingId] ?? 'NotInitialized';
      buildingPanel.open(buildingId, name, `Building: ${name}`, status);
    },
  });

  const terminalOverlay = new TerminalOverlay({
    onInput: (agentId, data) => {
      connectionRef?.sendInput({
        tick: clientTickRef,
        movement: { x: 0, y: 0 },
        action: { VibeInput: { agent_id: agentId, data } },
        target: null,
      });
    },
    checkPylonProximity: (buildingId) => isBuildingNearPylon(buildingId, entityMap),
  });

  const agentWorldTooltip = new AgentWorldTooltip({
    onOpenTerminal: (agentId, buildingId, agentName, buildingName) => {
      terminalOverlay.openPinned(agentId, buildingId, agentName, buildingName);
    },
  });

  // Track which building the toolbar is currently showing for
  let toolbarBuildingEntityId: number | null = null;

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

  // ── Combat VFX renderer ────────────────────────────────────────
  const combatVFX = new CombatVFX();

  // ── World container (moves with camera, scaled for pixel art) ───
  const ZOOM = 3; // 3× zoom so 16 px pixel-art tiles are clearly visible
  const worldContainer = new Container();
  worldContainer.label = 'world-container';
  worldContainer.scale.set(ZOOM);
  worldContainer.addChild(worldRenderer.container);   // bottom: terrain
  worldContainer.addChild(lightingRenderer.container); // darkness overlay
  worldContainer.addChild(entityRenderer.container);   // entities
  worldContainer.addChild(player);                     // player on top
  worldContainer.addChild(combatVFX.worldLayer);       // combat VFX on top
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
  uiContainer.addChild(minimap.tooltipContainer);
  uiContainer.addChild(equipmentHud.tooltipContainer); // tooltip on top of all UI
  uiContainer.addChild(agentsHud.tooltipContainer);    // agent tooltip on top of all UI

  uiContainer.addChild(combatVFX.screenLayer);          // vignette overlay
  const deathScreen = new DeathScreen();
  uiContainer.addChild(deathScreen.container);

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
  connectionRef = connection;

  // Track the latest server state
  let latestState: GameStateUpdate | null = null;
  let previousTick = 0;
  let initComplete = false;

  connection.onState((state: GameStateUpdate) => {
    latestState = state;

    // Wait for project initialization before revealing the game
    if (!initComplete && state.project_manager?.initialized) {
      initComplete = true;
      root.unmount();
      uiRoot.style.display = 'none';
      console.log('[client] Project initialization confirmed — starting game');
    }
  });

  connection.onVibeOutput((agentId, data) => {
    terminalOverlay.writeOutput(agentId, data);
  });

  connection.onVibeSession((event) => {
    if (event.type === 'started') {
      console.log(`[vibe] Session started for agent ${event.agentId}`);
    } else if (event.type === 'ended') {
      terminalOverlay.sessionEnded(event.agentId, event.reason ?? 'unknown');
      // Clean up the terminal instance after a short delay so the user can read the final output
      setTimeout(() => terminalOverlay.removeSession(event.agentId), 10_000);
    }
  });

  // ── Send saved project directory to server on startup ───────────
  // The title screen guarantees a directory is selected before reaching here.
  const savedProjectDir = getProjectDir();
  if (savedProjectDir) {
    connection.sendInput({
      tick: 0,
      movement: { x: 0, y: 0 },
      action: { SetProjectDirectory: { path: savedProjectDir } },
      target: null,
    });

    // Check if reset was requested from settings
    if (localStorage.getItem('project_should_reset') === 'true') {
      localStorage.removeItem('project_should_reset');
      connection.sendInput({
        tick: 0,
        movement: { x: 0, y: 0 },
        action: "ResetProjects",
        target: null,
      });
    }

    // Always initialize projects — the init flag is set by the title screen
    if (getProjectInitFlag()) {
      setProjectInitFlag(false);
      connection.sendInput({
        tick: 0,
        movement: { x: 0, y: 0 },
        action: "InitializeProjects",
        target: null,
      });
    }
  }

  // Send Mistral API key to server for vibe sessions
  const mistralKey = getApiKey('mistral');
  if (mistralKey) {
    connection.sendInput({
      tick: 0,
      movement: { x: 0, y: 0 },
      action: { SetMistralApiKey: { key: mistralKey } },
      target: null,
    });
  }

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

  buildHotbar.onOpenBrowser = () => {
    buildMenu.open();
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

  debugPanel.onToggleFullLight = () => {
    lightingRenderer.setFullLight(!lightingRenderer.fullLight);
  };

  // ── Default equipment loadout ──────────────────────────────────
  equipmentHud.equipWeapon('shortsword');
  equipmentHud.equipArmour('cloth');

  // Sync initial equipment to server
  connection.sendInput({ tick: 0, movement: { x: 0, y: 0 }, action: { EquipWeapon: { weapon_id: 'shortsword' } }, target: null });
  connection.sendInput({ tick: 0, movement: { x: 0, y: 0 }, action: { EquipArmor: { armor_id: 'cloth' } }, target: null });

  equipmentHud.onEquipChange = (kind: 'weapon' | 'armour', id: string) => {
    const action: PlayerAction = kind === 'weapon'
      ? { EquipWeapon: { weapon_id: id } }
      : { EquipArmor: { armor_id: id } };
    connection.sendInput({ tick: clientTickRef, movement: { x: 0, y: 0 }, action, target: null });
  };

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

    // Hotbar tooltip hover tracking
    const hotbarBounds = buildHotbar.container.getBounds();
    const hLocalX = e.clientX - hotbarBounds.x;
    const hLocalY = e.clientY - hotbarBounds.y;
    const slotIdx = buildHotbar.getSlotAtPosition(hLocalX, hLocalY);

    if (slotIdx >= 0) {
      const entry = buildHotbar.getEntry(slotIdx);
      if (entry) {
        const buildingDef = ALL_BUILDINGS.find(b => b.type === entry.type);
        const buildingId = buildingIdFromType(entry.type);
        const tierLabel = TIER_NAMES[buildingDef?.tier ?? 0] ?? '';
        const tier = buildingDef?.tier ?? 0;

        // Determine status — infrastructure (tier 0) is always available
        let status = 'Available';
        if (tier > 0) {
          const unlocked = latestState?.project_manager?.unlocked_buildings ?? [];
          if (unlocked.length > 0 && !unlocked.includes(buildingId)) {
            status = 'Locked';
          }
        }

        // Calculate display cost (escalating for stackable infrastructure)
        let displayCost = entry.cost;
        const isStackable = entry.type === 'Pylon' || entry.type === 'ComputeFarm';
        if (isStackable) {
          const existingCount = buildingCountsCache.get(entry.type) ?? 0;
          displayCost = Math.ceil(entry.cost * Math.pow(1.5, existingCount));
        }

        // Position above the slot center
        const slotScreenX = hotbarBounds.x + 8 + slotIdx * (64 + 4) + 32; // PADDING + idx * (SLOT_W + SLOT_GAP) + SLOT_W/2
        const slotScreenY = hotbarBounds.y + 18; // slot Y offset

        hotbarTooltip.show(
          slotScreenX, slotScreenY,
          buildingDef?.name ?? entry.name,
          displayCost,
          buildingDef?.description ?? '',
          tierLabel,
          status,
        );
      }
    } else {
      hotbarTooltip.hide();
    }

  });

  // ── Building hover toolbar (on window so it fires even over toolbar HTML) ──
  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (buildMenu.placementMode || buildingPanel.visible) {
      if (buildingToolbar.visible) buildingToolbar.hide();
      return;
    }

    const worldX = (e.clientX - worldContainer.x) / ZOOM;
    const worldY = (e.clientY - worldContainer.y) / ZOOM;
    let nearestBuildingId: number | null = null;
    let nearestDist = 48; // hover range in world pixels (matches E-key range)
    let nearestBuildingType = '';
    let nearestBx = 0;
    let nearestBy = 0;

    for (const entity of entityMap.values()) {
      if (entity.kind !== 'Building') continue;
      const data = (entity.data as { Building?: { building_type: string; construction_pct: number } }).Building;
      if (!data) continue;
      const dx = entity.position.x - worldX;
      const dy = entity.position.y - worldY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBuildingId = entity.id;
        nearestBuildingType = data.building_type;
        nearestBx = entity.position.x;
        nearestBy = entity.position.y;
      }
    }

    if (nearestBuildingId !== null) {
      const bid = buildingTypeToId(nearestBuildingType);
      const name = buildingTypeToName(nearestBuildingType);
      const status = latestState?.project_manager?.building_statuses?.[bid] ?? 'NotInitialized';
      const assignments = latestState?.project_manager?.agent_assignments?.[bid] ?? [];

      // Resolve agent names from entity map
      const assignedAgents = assignments.map(agentId => {
        const agentEntity = entityMap.get(agentId);
        const agentData = agentEntity ? (agentEntity.data as { Agent?: { name: string; tier: string } }).Agent : null;
        return { id: agentId, name: agentData?.name ?? '?', tier: agentData?.tier ?? 'Apprentice' };
      });

      // Passive buildings — show description instead of agents/open app
      const passiveDescriptions: Record<string, string> = {
        Pylon: 'Enables observability into what agents are doing.',
        ComputeFarm: 'Passively generates tokens over time.',
      };
      const desc = passiveDescriptions[nearestBuildingType];

      // Feed idle agents to the picker (only for active buildings)
      if (!desc) buildingToolbar.setIdleAgents(getIdleAgents());
      buildingToolbar.show(bid, name, status, assignedAgents, desc ? { description: desc } : undefined);
      buildingToolbar.cancelScheduledHide();
      toolbarBuildingEntityId = nearestBuildingId;

      // Position BELOW the building in screen coords (building sprite is 12px, so offset by ~10 world px)
      const screenBx = nearestBx * ZOOM + worldContainer.x;
      const screenBy = nearestBy * ZOOM + worldContainer.y + 10 * ZOOM;
      buildingToolbar.updatePosition(screenBx, screenBy);
    } else if (buildingToolbar.visible) {
      buildingToolbar.scheduleHide();
    }

    // ── Agent hover detection (for agent world tooltip) ────────────────
    if (!terminalOverlay.visible) {
      let nearestAgentId: number | null = null;
      type AgentEntityData = { name: string; tier: string; state: string; health_pct: number; morale_pct: number; stars: number; turns_used: number; max_turns: number; model_lore_name: string; xp: number; level: number };
      let nearestAgentDist = 32; // hover range in world pixels
      let nearestAgentData: AgentEntityData | null = null;

      for (const entity of entityMap.values()) {
        if (entity.kind !== 'Agent') continue;
        const data = (entity.data as { Agent?: AgentEntityData }).Agent;
        if (!data) continue;
        const dx = entity.position.x - worldX;
        const dy = entity.position.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestAgentDist) {
          nearestAgentDist = dist;
          nearestAgentId = entity.id;
          nearestAgentData = data;
        }
      }

      if (nearestAgentId !== null && nearestAgentData !== null) {
        // Find which building this agent is assigned to (if any)
        let agentBuildingId = '';
        let agentBuildingName = '';
        if (latestState?.project_manager?.agent_assignments) {
          for (const [bid, agents] of Object.entries(latestState.project_manager.agent_assignments)) {
            if ((agents as number[]).includes(nearestAgentId)) {
              agentBuildingId = bid;
              agentBuildingName = buildingTypeToName(bid.replace(/_./g, m => m[1].toUpperCase()).replace(/^./, c => c.toUpperCase()));
              break;
            }
          }
        }

        const agentWorldData: AgentWorldData = {
          id: nearestAgentId,
          name: nearestAgentData.name,
          tier: nearestAgentData.tier,
          state: nearestAgentData.state,
          health_pct: nearestAgentData.health_pct,
          morale_pct: nearestAgentData.morale_pct,
          stars: nearestAgentData.stars,
          turns_used: nearestAgentData.turns_used,
          max_turns: nearestAgentData.max_turns,
          model_lore_name: nearestAgentData.model_lore_name,
          xp: nearestAgentData.xp,
          level: nearestAgentData.level,
        };

        agentWorldTooltip.show(agentWorldData, e.clientX, e.clientY, agentBuildingId, agentBuildingName);
        agentWorldTooltip.cancelScheduledHide();
      } else if (agentWorldTooltip.visible) {
        agentWorldTooltip.scheduleHide();
      }
    }
  });

  app.canvas.addEventListener('click', (e: MouseEvent) => {
    // ── Hotbar click detection ─────────────────────────────────────
    const hotbarBounds = buildHotbar.container.getBounds();
    const hLocalX = e.clientX - hotbarBounds.x;
    const hLocalY = e.clientY - hotbarBounds.y;
    const clickedSlot = buildHotbar.getSlotAtPosition(hLocalX, hLocalY);

    if (clickedSlot === -2) {
      // "+" button clicked — open building browser
      buildMenu.toggle();
      return;
    }
    if (clickedSlot >= 0) {
      // Building slot clicked — select it (enters placement mode)
      buildHotbar.selectSlot(clickedSlot);
      return;
    }

    if (buildMenu.placementMode) {
      const worldX = (e.clientX - worldContainer.x) / ZOOM;
      const worldY = (e.clientY - worldContainer.y) / ZOOM;
      buildMenu.confirmPlacement(worldX, worldY);
      buildHotbar.clearSelection();
      return;
    }

    // ── Agent click detection — click Building agent to open terminal ──
    {
      const worldX = (e.clientX - worldContainer.x) / ZOOM;
      const worldY = (e.clientY - worldContainer.y) / ZOOM;
      type AgentClickData = { name: string; tier: string; state: string };
      let clickedAgentId: number | null = null;
      let clickedAgentData: AgentClickData | null = null;
      let clickedDist = 32;

      for (const entity of entityMap.values()) {
        if (entity.kind !== 'Agent') continue;
        const data = (entity.data as { Agent?: AgentClickData }).Agent;
        if (!data) continue;
        const dx = entity.position.x - worldX;
        const dy = entity.position.y - worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < clickedDist) {
          clickedDist = dist;
          clickedAgentId = entity.id;
          clickedAgentData = data;
        }
      }

      if (clickedAgentId !== null && clickedAgentData !== null && clickedAgentData.state === 'Building') {
        // Find which building this agent is assigned to
        let agentBuildingId = '';
        let agentBuildingName = '';
        if (latestState?.project_manager?.agent_assignments) {
          for (const [bid, agents] of Object.entries(latestState.project_manager.agent_assignments)) {
            if ((agents as number[]).includes(clickedAgentId)) {
              agentBuildingId = bid;
              agentBuildingName = buildingTypeToName(bid.replace(/_./g, m => m[1].toUpperCase()).replace(/^./, c => c.toUpperCase()));
              break;
            }
          }
        }
        agentWorldTooltip.hide();
        terminalOverlay.openPinned(clickedAgentId, agentBuildingId, clickedAgentData.name, agentBuildingName);
      }
    }
  });

  app.canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    if (buildMenu.placementMode) {
      e.preventDefault();
      buildMenu.cancelPlacement();
      buildHotbar.clearSelection();
    }
  });

  app.canvas.addEventListener('wheel', (e: WheelEvent) => {
    if (minimap.expanded) {
      e.preventDefault();
      if (e.deltaY < 0) {
        minimap.zoomIn();
      } else {
        minimap.zoomOut();
      }
    }
  }, { passive: false });

  // ── Keyboard input tracking ─────────────────────────────────────
  const keys: Set<string> = new Set();
  let crankActive = false;
  let playerHitFlash = 0;
  let lastAttackAction = false;

  // Track keys that should fire once on press (not held)
  const justPressed: Set<string> = new Set();

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    hotbarTooltip.hide();
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

    // ── Terminal overlay key handling ─────────────────────────────
    if (terminalOverlay.visible && key === 'escape') {
      terminalOverlay.close();
      return;
    }

    // ── Building panel key handling ─────────────────────────────────
    if (buildingPanel.visible) {
      if (key === 'escape') {
        buildingPanel.close();
        return;
      }
      // While building panel is open, consume all keys
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
      if (key === '=' || key === '+') {
        minimap.zoomIn();
        return;
      }
      if (key === '-') {
        minimap.zoomOut();
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
      if (key === 'arrowleft' || key === 'a') {
        buildMenu.selectLeft();
        return;
      }
      if (key === 'arrowright' || key === 'd') {
        buildMenu.selectRight();
        return;
      }
      if (key === 'enter') {
        buildMenu.confirmSelection();
        return;
      }
      if (key === 'escape' || key === 'b') {
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

    if (key === '0') {
      buildMenu.toggle();
      return;
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
    clientTickRef = clientTick;

    // Block movement and actions while any overlay is open
    const menuBlocking = buildMenu.visible || upgradeTree.visible || grimoire.visible || debugPanel.visible || minimap.expanded || buildingPanel.visible || deathScreen.isActive;

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
        // Check for a nearby completed building to interact with
        let interactedWithBuilding = false;
        const px = player.x;
        const py = player.y;
        let nearestDist = 48; // interaction range in world pixels
        let nearestType = '';
        for (const entity of entityMap.values()) {
          if (entity.kind !== 'Building') continue;
          const data = (entity.data as { Building?: { building_type: string; construction_pct: number } }).Building;
          if (!data || data.construction_pct < 1.0) continue;
          const dx = entity.position.x - px;
          const dy = entity.position.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestType = data.building_type;
          }
        }
        if (nearestType) {
          const buildingId = buildingTypeToId(nearestType);
          const name = buildingTypeToName(nearestType);
          const status = latestState?.project_manager?.building_statuses?.[buildingId] ?? 'NotInitialized';
          buildingPanel.open(buildingId, name, `Building: ${name}`, status);
          buildingToolbar.hide();
          toolbarBuildingEntityId = null;
          interactedWithBuilding = true;
        }

        if (!interactedWithBuilding) {
          crankActive = !crankActive;
          action = crankActive ? 'CrankStart' : 'CrankStop';
        }
      }
    }

    // Clear just-pressed keys
    justPressed.clear();

    // ── Weapon combat stats (arc, range, color) for VFX ────────
    const WEAPON_COMBAT_STATS: Record<string, { arc: number; range: number; color: number }> = {
      shortsword: { arc: 90, range: 30, color: 0xeeeeee },
      greatsword: { arc: 180, range: 35, color: 0xff6622 },
      staff: { arc: 120, range: 40, color: 0x6644ff },
      crossbow: { arc: 0, range: 120, color: 0x44ccff },
      torch: { arc: 360, range: 25, color: 0xff8800 },
    };

    const ROGUE_COLORS: Record<string, number> = {
      Corruptor: 0xcc44cc,
      Looper: 0x44cccc,
      TokenDrain: 0x88cc44,
      Assassin: 0xff2222,
      Swarm: 0x886644,
      Mimic: 0xd4a017,
      Architect: 0x8844cc,
    };

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

      // ── Process combat events for VFX ────────────────────────────
      if (state.combat_events && state.combat_events.length > 0) {
        for (const evt of state.combat_events) {
          combatVFX.spawnDamageNumber(evt.x, evt.y, evt.damage, false);
          if (evt.is_kill && evt.rogue_type) {
            const color = ROGUE_COLORS[evt.rogue_type] ?? 0xffffff;
            combatVFX.spawnDeathParticles(evt.x, evt.y, color);
            combatVFX.triggerShake(3, 5);
          }
        }
      }

      // ── Player took damage VFX ─────────────────────────────────
      if (state.player_hit && state.player_hit_damage > 0) {
        combatVFX.spawnDamageNumber(pos.x, pos.y - 4, state.player_hit_damage, true);
        playerHitFlash = 6;
        if (state.player_hit_damage >= 3) {
          combatVFX.triggerShake(5, 8);
        }
      }

      // ── Player hit flash ─────────────────────────────────────────
      if (playerHitFlash > 0) {
        player.tint = 0xff4444;
        playerHitFlash--;
      } else {
        player.tint = 0xffffff;
      }

      // ── Player attack swing arc ─────────────────────────────────
      if (action === 'Attack' && !state.player.dead) {
        const facing = state.player.facing;
        const equipped = equipmentHud.getEquippedWeapon();
        const weaponId = equipped?.id ?? 'shortsword';
        const stats = WEAPON_COMBAT_STATS[weaponId];
        if (stats && stats.arc > 0) {
          combatVFX.spawnSwingArc(
            pos.x, pos.y,
            facing.x, facing.y,
            stats.arc, stats.range,
            stats.color,
          );
        }
      }

      // ── Low HP vignette ──────────────────────────────────────────
      const hpPct = state.player.max_health > 0
        ? state.player.health / state.player.max_health
        : 1;
      combatVFX.updateVignette(hpPct, window.innerWidth, window.innerHeight);

      // ── Tick all VFX ─────────────────────────────────────────────
      combatVFX.update();

      // ── Camera: center world container on player (with shake) ────
      const halfW = window.innerWidth / 2;
      const halfH = window.innerHeight / 2;
      const shake = combatVFX.getShakeOffset();
      worldContainer.x = halfW - pos.x * ZOOM + shake.x;
      worldContainer.y = halfH - pos.y * ZOOM + shake.y;

      // Update torch light position and radius
      torchLight.x = pos.x;
      torchLight.y = pos.y;

      // Update entity renderer with changed/removed entities
      entityRenderer.update(state.entities_changed, state.entities_removed);

      // Maintain persistent entity map (update BEFORE light collection
      // so newly placed buildings are immediately available)
      for (const entity of state.entities_changed) {
        entityMap.set(entity.id, entity);
      }
      for (const removedId of state.entities_removed) {
        entityMap.delete(removedId);
      }

      // ── Update build menu & hotbar with placed building counts ──────
      {
        const counts = new Map<BuildingTypeKind, number>();
        for (const entity of entityMap.values()) {
          if (entity.kind !== 'Building') continue;
          const data = (entity.data as { Building?: { building_type: BuildingTypeKind } }).Building;
          if (!data) continue;
          counts.set(data.building_type, (counts.get(data.building_type) ?? 0) + 1);
        }
        buildingCountsCache = counts;
        buildMenu.setPlacedBuildingCounts(counts);
        buildHotbar.setPlacedBuildingCounts(counts);
      }

      // ── Collect all light sources (player + buildings) ──────────────
      const lightSources: LightSource[] = [];

      // Player torch
      if (state.player.torch_range > 0) {
        lightSources.push({ x: pos.x, y: pos.y, radius: state.player.torch_range });
      }

      // Completed buildings with light sources
      for (const entity of entityMap.values()) {
        if (entity.kind !== 'Building') continue;
        const data = (entity.data as { Building?: { building_type: BuildingTypeKind; construction_pct: number } }).Building;
        if (!data || data.construction_pct < 1.0) continue;
        const radius = BUILDING_LIGHT_RADIUS[data.building_type];
        if (radius) {
          const src: LightSource = { x: entity.position.x, y: entity.position.y, radius };
          // Pylons get a warm amber ring at their boundary
          if (data.building_type === 'Pylon') {
            src.ringColor = 0xffcc44;
          }
          lightSources.push(src);
        }
      }

      lightingRenderer.updateLights(lightSources);

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

      // ── Project manager state: feed unlock & status data ────────
      if (state.project_manager) {
        // Update build menu with unlocked building list
        buildMenu.setUnlockedBuildings(state.project_manager.unlocked_buildings);

        // Live-update the building panel if it is open
        if (buildingPanel.visible && buildingPanel.currentBuildingId) {
          const currentId = buildingPanel.currentBuildingId;
          const status = state.project_manager.building_statuses[currentId] ?? 'NotInitialized';
          buildingPanel.updateStatus(status);
        }
      }

      // ── Update building toolbar position to follow camera ────────
      if (buildingToolbar.visible && toolbarBuildingEntityId !== null) {
        const bEntity = entityMap.get(toolbarBuildingEntityId);
        if (bEntity) {
          const screenBx = bEntity.position.x * ZOOM + worldContainer.x;
          const screenBy = bEntity.position.y * ZOOM + worldContainer.y + 10 * ZOOM;
          buildingToolbar.updatePosition(screenBx, screenBy);
        }

        // Hide toolbar when any blocking overlay opens
        if (menuBlocking) {
          buildingToolbar.hide();
          toolbarBuildingEntityId = null;
        }
      }

      // Death screen
      if (state.player.dead) {
        if (!deathScreen.isActive) {
          deathScreen.show();
        }
        deathScreen.update(state.player.death_timer, window.innerWidth, window.innerHeight);
      } else {
        if (deathScreen.isActive) {
          deathScreen.hide();
        }
      }

      previousTick = state.tick;
    }
  });
}

// Mount React title screen
const uiRoot = document.getElementById('ui-root')!;
const root = createRoot(uiRoot);
root.render(<TitleScreen onPlay={() => startGame()} />);
