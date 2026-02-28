import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { EntityDelta, AgentStateKind, AgentTierKind } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';

const headerStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

const agentNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const agentNameDeadStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: 'bold',
  fill: 0x444444,
});

const stateStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a6a5a,
});

// ── Agent state colors ──────────────────────────────────────────────

const STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x333333,
};

// ── Tier badge colors ───────────────────────────────────────────────

const TIER_COLORS: Record<AgentTierKind, number> = {
  Apprentice: 0x6a6a5a,
  Journeyman: 0x4a8a4a,
  Artisan: 0x6a6acc,
  Architect: 0xd4a017,
};

// ── Layout ──────────────────────────────────────────────────────────

const PANEL_WIDTH = 180;
const CARD_HEIGHT = 42;
const CARD_GAP = 4;
const MAX_VISIBLE = 6;
const BAR_W = 60;
const BAR_H = 4;

// ── Internal agent entry ────────────────────────────────────────────

interface AgentEntry {
  id: number;
  name: string;
  tier: AgentTierKind;
  state: AgentStateKind;
  health_pct: number;
  morale_pct: number;
  stars: number;
  turns_used: number;
  max_turns: number;
  model_lore_name: string;
  xp: number;
  level: number;
}

// ── Corner brackets ─────────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics, x: number, y: number, w: number, h: number,
  size: number, color: number, alpha: number,
): void {
  // Top-left
  gfx.moveTo(x, y + size);
  gfx.lineTo(x, y);
  gfx.lineTo(x + size, y);
  gfx.stroke({ color, alpha, width: 1 });
  // Top-right
  gfx.moveTo(x + w - size, y);
  gfx.lineTo(x + w, y);
  gfx.lineTo(x + w, y + size);
  gfx.stroke({ color, alpha, width: 1 });
  // Bottom-right
  gfx.moveTo(x + w, y + h - size);
  gfx.lineTo(x + w, y + h);
  gfx.lineTo(x + w - size, y + h);
  gfx.stroke({ color, alpha, width: 1 });
  // Bottom-left
  gfx.moveTo(x + size, y + h);
  gfx.lineTo(x, y + h);
  gfx.lineTo(x, y + h - size);
  gfx.stroke({ color, alpha, width: 1 });
}

// ── AgentsHUD class ─────────────────────────────────────────────────

export class AgentsHUD {
  readonly container: Container;

  private agents: Map<number, AgentEntry> = new Map();
  private panelBg: Graphics;
  private brackets: Graphics;
  private headerText: Text;
  private countText: Text;
  private cardContainer: Container;
  private needsRebuild = true;

  constructor() {
    this.container = new Container();
    this.container.label = 'agents-hud';

    // Position below the main HUD panel
    this.container.x = 6;
    this.container.y = 134;

    // Background
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // Corner brackets
    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // Header
    this.headerText = new Text({ text: 'AGENTS', style: headerStyle });
    this.headerText.x = 12;
    this.headerText.y = 8;
    this.container.addChild(this.headerText);

    // Agent count
    this.countText = new Text({
      text: '0',
      style: new TextStyle({ fontFamily: FONT, fontSize: 10, fill: 0x5a5a4a }),
    });
    this.countText.x = PANEL_WIDTH - 24;
    this.countText.y = 8;
    this.container.addChild(this.countText);

    // Card container
    this.cardContainer = new Container();
    this.cardContainer.x = 6;
    this.cardContainer.y = 26;
    this.container.addChild(this.cardContainer);

    this.drawPanel(0);
  }

  // ── Public API ───────────────────────────────────────────────────

  update(entities: EntityDelta[]): void {
    let changed = false;

    for (const delta of entities) {
      if ('Agent' in delta.data) {
        const a = delta.data.Agent;
        this.agents.set(delta.id, {
          id: delta.id,
          name: a.name,
          tier: a.tier,
          state: a.state,
          health_pct: a.health_pct,
          morale_pct: a.morale_pct,
          stars: a.stars,
          turns_used: a.turns_used,
          max_turns: a.max_turns,
          model_lore_name: a.model_lore_name,
          xp: a.xp,
          level: a.level,
        });
        changed = true;
      }
    }

    if (changed) {
      this.needsRebuild = true;
    }

    if (this.needsRebuild) {
      this.rebuildCards();
      this.needsRebuild = false;
    }
  }

  removeAgents(ids: number[]): void {
    for (const id of ids) {
      this.agents.delete(id);
    }
    this.needsRebuild = true;
  }

  // ── Private ──────────────────────────────────────────────────────

  private drawPanel(cardCount: number): void {
    const contentH = Math.max(1, cardCount) * (CARD_HEIGHT + CARD_GAP) + 32;

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, PANEL_WIDTH, contentH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.72 });
    this.panelBg.roundRect(0, 0, PANEL_WIDTH, contentH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });

    this.brackets.clear();
    drawCornerBrackets(this.brackets, 0, 0, PANEL_WIDTH, contentH, 8, 0xd4a017, 0.25);
  }

  private rebuildCards(): void {
    // Clear cards
    while (this.cardContainer.children.length > 0) {
      const child = this.cardContainer.children[0];
      this.cardContainer.removeChild(child);
      child.destroy({ children: true });
    }

    // Sort: alive first, alphabetical
    const sorted = Array.from(this.agents.values()).sort((a, b) => {
      const aDead = a.state === 'Unresponsive' ? 1 : 0;
      const bDead = b.state === 'Unresponsive' ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      return a.name.localeCompare(b.name);
    });

    const visible = sorted.slice(0, MAX_VISIBLE);
    this.countText.text = `${sorted.length}`;

    for (let i = 0; i < visible.length; i++) {
      const agent = visible[i];
      const card = this.buildCard(agent);
      card.y = i * (CARD_HEIGHT + CARD_GAP);
      this.cardContainer.addChild(card);
    }

    this.drawPanel(visible.length);
  }

  private buildCard(agent: AgentEntry): Container {
    const card = new Container();
    const isDead = agent.state === 'Unresponsive';
    const cw = PANEL_WIDTH - 12;

    // Card background
    const bg = new Graphics();
    bg.roundRect(0, 0, cw, CARD_HEIGHT, 2);
    bg.fill({ color: isDead ? 0x0a0908 : 0x151210, alpha: 0.6 });
    card.addChild(bg);

    // State indicator dot
    const dot = new Graphics();
    const dotColor = STATE_COLORS[agent.state];
    dot.circle(8, 10, 3);
    dot.fill(dotColor);
    if (!isDead && (agent.state === 'Critical' || agent.state === 'Erroring')) {
      dot.circle(8, 10, 5);
      dot.stroke({ color: dotColor, alpha: 0.4, width: 1 });
    }
    card.addChild(dot);

    // Name
    const name = new Text({
      text: agent.name,
      style: isDead ? agentNameDeadStyle : agentNameStyle,
    });
    name.x = 16;
    name.y = 2;
    card.addChild(name);

    // Star rating (replaces old tier badge dot)
    const starText = new Text({
      text: '\u2605'.repeat(agent.stars) + '\u2606'.repeat(3 - agent.stars),
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 9,
        fill: 0xd4a017,
      }),
    });
    starText.x = cw - starText.width - 4;
    starText.y = 3;
    card.addChild(starText);

    // State text
    const stateText = new Text({
      text: isDead ? 'dead' : agent.state.toLowerCase(),
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 8,
        fill: isDead ? 0x444444 : STATE_COLORS[agent.state],
      }),
    });
    stateText.x = 16;
    stateText.y = 16;
    card.addChild(stateText);

    // Mini health bar
    this.drawMiniBar(card, 16, 28, agent.health_pct, isDead ? 0x222222 : 0x883333, isDead);

    // Mini morale bar
    this.drawMiniBar(card, 16 + BAR_W + 8, 28, agent.morale_pct, isDead ? 0x222222 : 0x887733, isDead);

    return card;
  }

  private drawMiniBar(
    parent: Container, x: number, y: number,
    value: number, color: number, greyed: boolean,
  ): void {
    const bg = new Graphics();
    bg.rect(x, y, BAR_W, BAR_H);
    bg.fill({ color: greyed ? 0x111111 : 0x1a1210, alpha: 0.9 });
    parent.addChild(bg);

    const clamped = Math.max(0, Math.min(1, value));
    const fillW = Math.round(clamped * BAR_W);
    if (fillW > 0) {
      const fill = new Graphics();
      fill.rect(x, y, fillW, BAR_H);
      fill.fill(color);
      parent.addChild(fill);
    }
  }
}
