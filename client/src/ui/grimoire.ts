import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { EntityDelta, AgentStateKind, AgentTierKind } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const titleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 22,
  fontWeight: 'bold',
  fill: 0xd4a017, // amber
});

const agentNameStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 16,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const agentNameDeadStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 16,
  fontWeight: 'bold',
  fill: 0x555555,
});

const tierStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fill: 0x888888,
});

const labelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x777777,
});

const deadLabelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x8b2222, // dark red
});

const instructionStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x555555,
});

// ── Agent state colors (matching entity renderer) ────────────────────

const AGENT_STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Walking: 0xaacc44,
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x444444,
  Dormant: 0x666688,
};

// ── Layout constants ─────────────────────────────────────────────────

const PANEL_PADDING = 24;
const AGENT_CARD_HEIGHT = 130;
const CARD_GAP = 12;
const BAR_WIDTH = 120;
const BAR_HEIGHT = 8;

// ── Internal agent data ──────────────────────────────────────────────

interface AgentEntry {
  id: number;
  name: string;
  tier: AgentTierKind;
  state: AgentStateKind;
  health_pct: number;
  morale_pct: number;
}

/**
 * Grimoire — a book-style UI overlay showing all agents and their status.
 *
 * Toggle with 'G' key. Shows each agent as a "page" with their name, tier,
 * state, health, and morale. Dead agents (Unresponsive) appear with a
 * "torn page" style: greyed out with strikethrough names.
 */
export class Grimoire {
  readonly container: Container;

  /** Whether the grimoire overlay is currently visible. */
  visible = false;

  private agents: Map<number, AgentEntry> = new Map();
  private scrollIndex = 0;
  private panelWidth = 500;
  private panelHeight = 600;

  // Panel elements
  private panel: Graphics;
  private titleText: Text;
  private instructionText: Text;
  private cardContainer: Container;

  constructor() {
    this.container = new Container();
    this.container.label = 'grimoire';
    this.container.visible = false;

    // ── Panel background ──────────────────────────────────────────
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // ── Title ─────────────────────────────────────────────────────
    this.titleText = new Text({ text: 'GRIMOIRE', style: titleStyle });
    this.titleText.x = PANEL_PADDING;
    this.titleText.y = PANEL_PADDING;
    this.container.addChild(this.titleText);

    // ── Instructions at bottom ────────────────────────────────────
    this.instructionText = new Text({
      text: '[Up/Down] scroll   [Esc/G] close',
      style: instructionStyle,
    });
    this.instructionText.x = PANEL_PADDING;
    this.container.addChild(this.instructionText);

    // ── Card container (holds agent cards) ────────────────────────
    this.cardContainer = new Container();
    this.cardContainer.x = PANEL_PADDING;
    this.cardContainer.y = PANEL_PADDING + 40;
    this.container.addChild(this.cardContainer);

    this.layoutPanel();
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Toggle the grimoire open/closed. */
  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) {
      this.scrollIndex = 0;
      this.rebuildCards();
    }
  }

  /** Open the grimoire. */
  open(): void {
    this.visible = true;
    this.container.visible = true;
    this.scrollIndex = 0;
    this.rebuildCards();
  }

  /** Close the grimoire. */
  close(): void {
    this.visible = false;
    this.container.visible = false;
  }

  /** Scroll to previous agent. */
  scrollPrev(): void {
    if (!this.visible) return;
    this.scrollIndex = Math.max(0, this.scrollIndex - 1);
    this.rebuildCards();
  }

  /** Scroll to next agent. */
  scrollNext(): void {
    if (!this.visible) return;
    const maxScroll = Math.max(0, this.agents.size - this.visibleCardCount());
    this.scrollIndex = Math.min(maxScroll, this.scrollIndex + 1);
    this.rebuildCards();
  }

  /**
   * Update internal agent data from server entity deltas.
   * Call this each frame with the entities_changed array.
   */
  update(entities: EntityDelta[]): void {
    let changed = false;

    for (const delta of entities) {
      if ('Agent' in delta.data) {
        const agent = delta.data.Agent;
        this.agents.set(delta.id, {
          id: delta.id,
          name: agent.name,
          tier: agent.tier,
          state: agent.state,
          health_pct: agent.health_pct,
          morale_pct: agent.morale_pct,
        });
        changed = true;
      }
    }

    // Only rebuild cards if the grimoire is open and data changed
    if (this.visible && changed) {
      this.rebuildCards();
    }
  }

  /** Reposition and resize the panel for the current screen size. */
  resize(width: number, height: number): void {
    this.panelWidth = Math.min(500, width - 40);
    this.panelHeight = Math.min(600, height - 40);
    this.container.x = Math.round((width - this.panelWidth) / 2);
    this.container.y = Math.round((height - this.panelHeight) / 2);
    this.layoutPanel();
    if (this.visible) {
      this.rebuildCards();
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private visibleCardCount(): number {
    const availableHeight = this.panelHeight - PANEL_PADDING * 2 - 70; // title + instructions
    return Math.max(1, Math.floor(availableHeight / (AGENT_CARD_HEIGHT + CARD_GAP)));
  }

  private layoutPanel(): void {
    this.panel.clear();
    this.panel.roundRect(0, 0, this.panelWidth, this.panelHeight, 4);
    this.panel.fill({ color: 0x1a1510, alpha: 0.95 });
    this.panel.roundRect(0, 0, this.panelWidth, this.panelHeight, 4);
    this.panel.stroke({ color: 0x3a3020, alpha: 0.8, width: 1 });

    this.instructionText.y = this.panelHeight - 28;
  }

  private rebuildCards(): void {
    // Clear existing cards
    while (this.cardContainer.children.length > 0) {
      const child = this.cardContainer.children[0];
      this.cardContainer.removeChild(child);
      child.destroy({ children: true });
    }

    // Sort agents: alive first, then dead; alphabetical within each group
    const sorted = Array.from(this.agents.values()).sort((a, b) => {
      const aDead = a.state === 'Unresponsive' ? 1 : 0;
      const bDead = b.state === 'Unresponsive' ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;
      return a.name.localeCompare(b.name);
    });

    const maxVisible = this.visibleCardCount();
    const start = this.scrollIndex;
    const end = Math.min(sorted.length, start + maxVisible);
    const cardWidth = this.panelWidth - PANEL_PADDING * 2;

    for (let i = start; i < end; i++) {
      const agent = sorted[i];
      const cardY = (i - start) * (AGENT_CARD_HEIGHT + CARD_GAP);
      const card = this.buildAgentCard(agent, cardWidth);
      card.y = cardY;
      this.cardContainer.addChild(card);
    }

    // Show scroll indicator if there are more agents
    if (sorted.length > maxVisible) {
      const indicator = new Text({
        text: `${start + 1}-${end} of ${sorted.length}`,
        style: labelStyle,
      });
      indicator.x = cardWidth - 80;
      indicator.y = -20;
      this.cardContainer.addChild(indicator);
    }
  }

  private buildAgentCard(agent: AgentEntry, cardWidth: number): Container {
    const card = new Container();
    const isDead = agent.state === 'Unresponsive';

    // ── Card background ────────────────────────────────────────────
    const bg = new Graphics();
    bg.roundRect(0, 0, cardWidth, AGENT_CARD_HEIGHT, 3);
    if (isDead) {
      bg.fill({ color: 0x111111, alpha: 0.7 });
      bg.roundRect(0, 0, cardWidth, AGENT_CARD_HEIGHT, 3);
      bg.stroke({ color: 0x333333, alpha: 0.5, width: 1 });
    } else {
      bg.fill({ color: 0x221e14, alpha: 0.8 });
      bg.roundRect(0, 0, cardWidth, AGENT_CARD_HEIGHT, 3);
      bg.stroke({ color: 0x3a3020, alpha: 0.6, width: 1 });
    }
    card.addChild(bg);

    // ── Agent name ─────────────────────────────────────────────────
    const nameText = new Text({
      text: agent.name,
      style: isDead ? agentNameDeadStyle : agentNameStyle,
    });
    nameText.x = 12;
    nameText.y = 8;
    card.addChild(nameText);

    // Strikethrough for dead agents
    if (isDead) {
      const strikethrough = new Graphics();
      const nameWidth = nameText.width;
      const nameY = nameText.y + nameText.height / 2;
      strikethrough.moveTo(12, nameY);
      strikethrough.lineTo(12 + nameWidth, nameY);
      strikethrough.stroke({ color: 0x555555, width: 1.5 });
      card.addChild(strikethrough);
    }

    // ── Tier label ─────────────────────────────────────────────────
    const tierText = new Text({
      text: agent.tier,
      style: tierStyle,
    });
    tierText.x = 12;
    tierText.y = 28;
    card.addChild(tierText);

    // ── State label ────────────────────────────────────────────────
    if (isDead) {
      const deadLabel = new Text({
        text: '[unresponsive]',
        style: deadLabelStyle,
      });
      deadLabel.x = cardWidth - 130;
      deadLabel.y = 10;
      card.addChild(deadLabel);
    } else {
      const stateColor = AGENT_STATE_COLORS[agent.state];
      const stateText = new Text({
        text: agent.state,
        style: new TextStyle({
          fontFamily: FONT_FAMILY,
          fontSize: 12,
          fill: stateColor,
        }),
      });
      stateText.x = cardWidth - 130;
      stateText.y = 10;
      card.addChild(stateText);
    }

    // ── Health bar ─────────────────────────────────────────────────
    const barStartY = 52;
    this.drawStatBar(
      card,
      12,
      barStartY,
      'HP',
      agent.health_pct,
      isDead ? 0x333333 : 0xcc4444,
      isDead,
    );

    // ── Morale bar ─────────────────────────────────────────────────
    this.drawStatBar(
      card,
      12,
      barStartY + 24,
      'Morale',
      agent.morale_pct,
      isDead ? 0x333333 : 0xccaa44,
      isDead,
    );

    // ── Additional stat placeholders ───────────────────────────────
    // We show what we have from the protocol; detailed stats
    // (reliability, speed, awareness, resilience) are not yet in the
    // entity delta, so we note them as unavailable.
    const statsNote = new Text({
      text: isDead ? '' : `HP: ${Math.round(agent.health_pct * 100)}%  Morale: ${Math.round(agent.morale_pct * 100)}%`,
      style: isDead
        ? new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0x444444 })
        : new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0x666666 }),
    });
    statsNote.x = 12;
    statsNote.y = barStartY + 52;
    card.addChild(statsNote);

    return card;
  }

  private drawStatBar(
    parent: Container,
    x: number,
    y: number,
    label: string,
    value: number,
    fillColor: number,
    greyed: boolean,
  ): void {
    // Label
    const labelText = new Text({
      text: label,
      style: greyed
        ? new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0x444444 })
        : labelStyle,
    });
    labelText.x = x;
    labelText.y = y;
    parent.addChild(labelText);

    // Bar background
    const barX = x + 60;
    const bg = new Graphics();
    bg.rect(barX, y + 2, BAR_WIDTH, BAR_HEIGHT);
    bg.fill(greyed ? 0x222222 : 0x333333);
    parent.addChild(bg);

    // Bar fill
    const clampedValue = Math.max(0, Math.min(1, value));
    const fillWidth = Math.round(clampedValue * BAR_WIDTH);
    if (fillWidth > 0) {
      const fill = new Graphics();
      fill.rect(barX, y + 2, fillWidth, BAR_HEIGHT);
      fill.fill(fillColor);
      parent.addChild(fill);
    }

    // Percentage text
    const pctText = new Text({
      text: `${Math.round(clampedValue * 100)}%`,
      style: greyed
        ? new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0x444444 })
        : new TextStyle({ fontFamily: FONT_FAMILY, fontSize: 10, fill: 0x888888 }),
    });
    pctText.x = barX + BAR_WIDTH + 6;
    pctText.y = y;
    parent.addChild(pctText);
  }
}
