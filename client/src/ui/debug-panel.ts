import { Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import type { PlayerAction, RogueTypeKind, AgentTierKind, DebugSnapshot } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const titleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 18,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const sectionStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0x999999,
});

const labelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x888888,
});

const valueOnStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fontWeight: 'bold',
  fill: 0x44cc66,
});

const valueOffStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fontWeight: 'bold',
  fill: 0xcc4444,
});

const instructionStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x555555,
});

// ── Layout constants ─────────────────────────────────────────────────

const PANEL_PADDING = 16;
const PANEL_WIDTH = 280;
const BUTTON_HEIGHT = 22;
const BUTTON_GAP = 4;
const SECTION_GAP = 14;
const BUTTON_FONT_SIZE = 10;

// ── Button helper ────────────────────────────────────────────────────

interface ButtonDef {
  label: string;
  action: PlayerAction;
  width?: number;
}

function createButton(
  def: ButtonDef,
  onClick: (action: PlayerAction) => void,
): Container {
  const btn = new Container();
  btn.eventMode = 'static';
  btn.cursor = 'pointer';

  const w = def.width ?? 56;
  const bg = new Graphics();
  bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
  bg.fill({ color: 0x2a2418, alpha: 0.9 });
  bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
  bg.stroke({ color: 0x3a3020, alpha: 0.6, width: 1 });
  btn.addChild(bg);

  const text = new Text({
    text: def.label,
    style: new TextStyle({
      fontFamily: FONT_FAMILY,
      fontSize: BUTTON_FONT_SIZE,
      fill: 0xd4a017,
    }),
  });
  text.x = Math.round((w - text.width) / 2);
  text.y = Math.round((BUTTON_HEIGHT - text.height) / 2);
  btn.addChild(text);

  btn.on('pointerdown', (e: FederatedPointerEvent) => {
    e.stopPropagation();
    onClick(def.action);
  });

  // Hover effect
  btn.on('pointerover', () => {
    bg.clear();
    bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
    bg.fill({ color: 0x3a3020, alpha: 0.95 });
    bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
    bg.stroke({ color: 0xd4a017, alpha: 0.8, width: 1 });
  });
  btn.on('pointerout', () => {
    bg.clear();
    bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
    bg.fill({ color: 0x2a2418, alpha: 0.9 });
    bg.roundRect(0, 0, w, BUTTON_HEIGHT, 3);
    bg.stroke({ color: 0x3a3020, alpha: 0.6, width: 1 });
  });

  return btn;
}

function layoutRow(
  parent: Container,
  buttons: Container[],
  x: number,
  y: number,
  gap: number,
): number {
  let cx = x;
  for (const btn of buttons) {
    btn.x = cx;
    btn.y = y;
    parent.addChild(btn);
    cx += btn.width + gap;
  }
  return y + BUTTON_HEIGHT;
}

// ── DebugPanel class ─────────────────────────────────────────────────

export class DebugPanel {
  readonly container: Container;

  visible = false;

  /** Callback invoked when a debug action button is clicked. */
  onAction: ((action: PlayerAction) => void) | null = null;

  /** Callback for client-side debug boundary overlay toggle. */
  onToggleBoundaries: (() => void) | null = null;

  /** Callback for toggling full-light mode (disables fog of war). */
  onToggleFullLight: (() => void) | null = null;

  // Panel elements
  private panel: Graphics;
  private contentContainer: Container;
  private panelHeight = 0;

  // Live state display texts
  private spawningText!: Text;
  private godModeText!: Text;
  private boundariesText!: Text;
  private fullLightText!: Text;
  private phaseText!: Text;
  private crankTierText!: Text;

  // Client-side state
  private boundariesOn = false;
  private fullLightOn = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'debug-panel';
    this.container.visible = false;
    this.container.eventMode = 'static';

    // Block clicks from reaching the world
    this.container.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
    });

    // ── Panel background ──────────────────────────────────────────
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // ── Content container ─────────────────────────────────────────
    this.contentContainer = new Container();
    this.contentContainer.x = PANEL_PADDING;
    this.contentContainer.y = PANEL_PADDING;
    this.container.addChild(this.contentContainer);

    this.buildContent();
  }

  // ── Public API ──────────────────────────────────────────────────

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
  }

  close(): void {
    this.visible = false;
    this.container.visible = false;
  }

  resize(width: number, _height: number): void {
    // Position panel on the right side of the screen
    this.container.x = width - PANEL_WIDTH - 20;
    this.container.y = 20;
  }

  /** Update the panel with live server debug state. */
  updateState(debug: DebugSnapshot): void {
    if (!this.visible) return;

    this.spawningText.text = debug.spawning_enabled ? 'ON' : 'OFF';
    this.spawningText.style = debug.spawning_enabled ? valueOnStyle : valueOffStyle;

    this.godModeText.text = debug.god_mode ? 'ON' : 'OFF';
    this.godModeText.style = debug.god_mode ? valueOnStyle : valueOffStyle;

    this.phaseText.text = debug.phase;
    this.crankTierText.text = debug.crank_tier;
  }

  // ── Build panel content ─────────────────────────────────────────

  private fireAction(action: PlayerAction): void {
    if (this.onAction) {
      this.onAction(action);
    }
  }

  private buildContent(): void {
    const c = this.contentContainer;
    const contentWidth = PANEL_WIDTH - PANEL_PADDING * 2;
    let y = 0;

    // ── Title ─────────────────────────────────────────────────────
    const title = new Text({ text: 'DEBUG', style: titleStyle });
    title.y = y;
    c.addChild(title);
    y += 28;

    // ── TOKENS section ────────────────────────────────────────────
    const tokensLabel = new Text({ text: 'TOKENS', style: sectionStyle });
    tokensLabel.y = y;
    c.addChild(tokensLabel);
    y += 18;

    const tokenButtons = [
      { label: '+100', action: { DebugAddTokens: { amount: 100 } } as PlayerAction, width: 48 },
      { label: '+1K', action: { DebugAddTokens: { amount: 1000 } } as PlayerAction, width: 42 },
      { label: '+10K', action: { DebugAddTokens: { amount: 10000 } } as PlayerAction, width: 46 },
      { label: 'MAX', action: { DebugSetTokens: { amount: 999999 } } as PlayerAction, width: 42 },
    ];
    y = layoutRow(
      c,
      tokenButtons.map((d) => createButton(d, (a) => this.fireAction(a))),
      0, y, BUTTON_GAP,
    );
    y += SECTION_GAP;

    // ── TOGGLES section ───────────────────────────────────────────
    const togglesLabel = new Text({ text: 'TOGGLES', style: sectionStyle });
    togglesLabel.y = y;
    c.addChild(togglesLabel);
    y += 18;

    // Spawning row
    const spawningLabel = new Text({ text: 'Spawning:', style: labelStyle });
    spawningLabel.x = 0;
    spawningLabel.y = y + 4;
    c.addChild(spawningLabel);

    this.spawningText = new Text({ text: 'ON', style: valueOnStyle });
    this.spawningText.x = 72;
    this.spawningText.y = y + 4;
    c.addChild(this.spawningText);

    const toggleSpawnBtn = createButton(
      { label: 'Toggle', action: 'DebugToggleSpawning', width: 52 },
      (a) => this.fireAction(a),
    );
    toggleSpawnBtn.x = contentWidth - 52;
    toggleSpawnBtn.y = y;
    c.addChild(toggleSpawnBtn);
    y += BUTTON_HEIGHT + BUTTON_GAP;

    // God Mode row
    const godLabel = new Text({ text: 'God Mode:', style: labelStyle });
    godLabel.x = 0;
    godLabel.y = y + 4;
    c.addChild(godLabel);

    this.godModeText = new Text({ text: 'OFF', style: valueOffStyle });
    this.godModeText.x = 72;
    this.godModeText.y = y + 4;
    c.addChild(this.godModeText);

    const toggleGodBtn = createButton(
      { label: 'Toggle', action: 'DebugToggleGodMode', width: 52 },
      (a) => this.fireAction(a),
    );
    toggleGodBtn.x = contentWidth - 52;
    toggleGodBtn.y = y;
    c.addChild(toggleGodBtn);
    y += BUTTON_HEIGHT + BUTTON_GAP;

    // Collision boundaries row (client-side toggle)
    const boundLabel = new Text({ text: 'Boundaries:', style: labelStyle });
    boundLabel.x = 0;
    boundLabel.y = y + 4;
    c.addChild(boundLabel);

    this.boundariesText = new Text({ text: 'OFF', style: valueOffStyle });
    this.boundariesText.x = 86;
    this.boundariesText.y = y + 4;
    c.addChild(this.boundariesText);

    const toggleBoundBtn = createButton(
      // Use a dummy action — we intercept this in the handler
      { label: 'Toggle', action: 'DebugToggleGodMode', width: 52 },
      () => {
        this.boundariesOn = !this.boundariesOn;
        this.boundariesText.text = this.boundariesOn ? 'ON' : 'OFF';
        this.boundariesText.style = this.boundariesOn ? valueOnStyle : valueOffStyle;
        if (this.onToggleBoundaries) this.onToggleBoundaries();
      },
    );
    toggleBoundBtn.x = contentWidth - 52;
    toggleBoundBtn.y = y;
    c.addChild(toggleBoundBtn);
    y += BUTTON_HEIGHT + BUTTON_GAP;

    // Full Light row (client-side toggle — disables fog of war)
    const fullLightLabel = new Text({ text: 'Full Light:', style: labelStyle });
    fullLightLabel.x = 0;
    fullLightLabel.y = y + 4;
    c.addChild(fullLightLabel);

    this.fullLightText = new Text({ text: 'OFF', style: valueOffStyle });
    this.fullLightText.x = 86;
    this.fullLightText.y = y + 4;
    c.addChild(this.fullLightText);

    const toggleFullLightBtn = createButton(
      { label: 'Toggle', action: 'DebugToggleGodMode', width: 52 },
      () => {
        this.fullLightOn = !this.fullLightOn;
        this.fullLightText.text = this.fullLightOn ? 'ON' : 'OFF';
        this.fullLightText.style = this.fullLightOn ? valueOnStyle : valueOffStyle;
        if (this.onToggleFullLight) this.onToggleFullLight();
      },
    );
    toggleFullLightBtn.x = contentWidth - 52;
    toggleFullLightBtn.y = y;
    c.addChild(toggleFullLightBtn);
    y += BUTTON_HEIGHT + SECTION_GAP;

    // ── ACTIONS section ───────────────────────────────────────────
    const actionsLabel = new Text({ text: 'ACTIONS', style: sectionStyle });
    actionsLabel.y = y;
    c.addChild(actionsLabel);
    y += 18;

    const actionButtons = [
      { label: 'Clear Rogues', action: 'DebugClearRogues' as PlayerAction, width: 100 },
      { label: 'Heal Player', action: 'DebugHealPlayer' as PlayerAction, width: 92 },
    ];
    y = layoutRow(
      c,
      actionButtons.map((d) => createButton(d, (a) => this.fireAction(a))),
      0, y, BUTTON_GAP,
    );
    y += BUTTON_GAP;

    const buildingButtons = [
      { label: 'Unlock All Buildings', action: 'DebugUnlockAllBuildings' as PlayerAction, width: 140 },
      { label: 'Lock All Buildings', action: 'DebugLockAllBuildings' as PlayerAction, width: 120 },
    ];
    y = layoutRow(
      c,
      buildingButtons.map((d) => createButton(d, (a) => this.fireAction(a))),
      0, y, BUTTON_GAP,
    );
    y += SECTION_GAP;

    // ── PHASE section ─────────────────────────────────────────────
    const phaseLabel = new Text({ text: 'PHASE', style: sectionStyle });
    phaseLabel.y = y;
    c.addChild(phaseLabel);

    this.phaseText = new Text({ text: 'Hut', style: labelStyle });
    this.phaseText.x = 50;
    this.phaseText.y = y;
    c.addChild(this.phaseText);
    y += 18;

    const phases = ['Hut', 'Outpost', 'Village', 'Network', 'City'];
    const phaseButtons = phases.map((p) => createButton(
      { label: p, action: { DebugSetPhase: { phase: p } } as PlayerAction, width: 46 },
      (a) => this.fireAction(a),
    ));
    // Row 1: first 3
    y = layoutRow(c, phaseButtons.slice(0, 3), 0, y, BUTTON_GAP);
    y += BUTTON_GAP;
    // Row 2: last 2
    y = layoutRow(c, phaseButtons.slice(3), 0, y, BUTTON_GAP);
    y += SECTION_GAP;

    // ── CRANK TIER section ────────────────────────────────────────
    const crankLabel = new Text({ text: 'CRANK', style: sectionStyle });
    crankLabel.y = y;
    c.addChild(crankLabel);

    this.crankTierText = new Text({ text: 'HandCrank', style: labelStyle });
    this.crankTierText.x = 50;
    this.crankTierText.y = y;
    c.addChild(this.crankTierText);
    y += 18;

    const tiers: { label: string; value: string }[] = [
      { label: 'Hand', value: 'HandCrank' },
      { label: 'Gear', value: 'GearAssembly' },
      { label: 'Water', value: 'WaterWheel' },
      { label: 'Runic', value: 'RunicEngine' },
    ];
    const tierButtons = tiers.map((t) => createButton(
      { label: t.label, action: { DebugSetCrankTier: { tier: t.value } } as PlayerAction, width: 50 },
      (a) => this.fireAction(a),
    ));
    y = layoutRow(c, tierButtons, 0, y, BUTTON_GAP);
    y += SECTION_GAP;

    // ── SPAWN ROGUE section ───────────────────────────────────────
    const spawnLabel = new Text({ text: 'SPAWN ROGUE', style: sectionStyle });
    spawnLabel.y = y;
    c.addChild(spawnLabel);
    y += 18;

    const rogueTypes: { label: string; value: RogueTypeKind }[] = [
      { label: 'Corr', value: 'Corruptor' },
      { label: 'Loop', value: 'Looper' },
      { label: 'Drain', value: 'TokenDrain' },
      { label: 'Assn', value: 'Assassin' },
    ];
    const rogueTypes2: { label: string; value: RogueTypeKind }[] = [
      { label: 'Swarm', value: 'Swarm' },
      { label: 'Mimic', value: 'Mimic' },
      { label: 'Arch', value: 'Architect' },
    ];

    const rogueButtons1 = rogueTypes.map((r) => createButton(
      { label: r.label, action: { DebugSpawnRogue: { rogue_type: r.value } } as PlayerAction, width: 48 },
      (a) => this.fireAction(a),
    ));
    y = layoutRow(c, rogueButtons1, 0, y, BUTTON_GAP);
    y += BUTTON_GAP;

    const rogueButtons2 = rogueTypes2.map((r) => createButton(
      { label: r.label, action: { DebugSpawnRogue: { rogue_type: r.value } } as PlayerAction, width: 48 },
      (a) => this.fireAction(a),
    ));
    y = layoutRow(c, rogueButtons2, 0, y, BUTTON_GAP);
    y += SECTION_GAP;

    // ── AGENTS section ──────────────────────────────────────────
    const agentsLabel = new Text({ text: 'AGENTS', style: sectionStyle });
    agentsLabel.y = y;
    c.addChild(agentsLabel);
    y += 18;

    const agentTiers: { label: string; value: AgentTierKind }[] = [
      { label: 'Appr', value: 'Apprentice' },
      { label: 'Jour', value: 'Journeyman' },
      { label: 'Art', value: 'Artisan' },
      { label: 'Arch', value: 'Architect' },
    ];
    const agentButtons = agentTiers.map((t) => createButton(
      { label: t.label, action: { DebugSpawnAgent: { tier: t.value } } as PlayerAction, width: 48 },
      (a) => this.fireAction(a),
    ));
    y = layoutRow(c, agentButtons, 0, y, BUTTON_GAP);
    y += BUTTON_GAP;

    const clearAgentsBtn = createButton(
      { label: 'Clear All', action: 'DebugClearAgents' as PlayerAction, width: 72 },
      (a) => this.fireAction(a),
    );
    clearAgentsBtn.x = 0;
    clearAgentsBtn.y = y;
    c.addChild(clearAgentsBtn);
    y += BUTTON_HEIGHT + SECTION_GAP;

    // ── Instructions ──────────────────────────────────────────────
    const instructions = new Text({
      text: '[`] close   [Esc] close',
      style: instructionStyle,
    });
    instructions.y = y;
    c.addChild(instructions);
    y += 18;

    // ── Draw panel background ─────────────────────────────────────
    this.panelHeight = y + PANEL_PADDING * 2;
    this.panel.clear();
    this.panel.roundRect(0, 0, PANEL_WIDTH, this.panelHeight, 4);
    this.panel.fill({ color: 0x1a1510, alpha: 0.95 });
    this.panel.roundRect(0, 0, PANEL_WIDTH, this.panelHeight, 4);
    this.panel.stroke({ color: 0x3a3020, alpha: 0.8, width: 1 });
  }
}
