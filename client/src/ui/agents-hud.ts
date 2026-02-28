import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
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

// ── Tooltip styles ──────────────────────────────────────────────────

const tooltipNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const tooltipLoreStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x8a7a5a,
});

const tooltipStatStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a8a6a,
});

const tooltipStateStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x9a9a8a,
});

const tooltipLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x5a5a4a,
});

const tooltipModelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a6a5a,
});

const TOOLTIP_W = 210;

const TIER_MODEL_NAMES: Record<AgentTierKind, string> = {
  Apprentice: 'Ministral 3B',
  Journeyman: 'Ministral 8B',
  Artisan: 'Codestral',
  Architect: 'Devstral 2',
};

const TIER_ICONS: Record<AgentTierKind, string> = {
  Apprentice: 'agent_1.png',
  Journeyman: 'agent_2.png',
  Artisan: 'agent_3.png',
  Architect: 'agent_4.png',
};

// ── Agent state colors ──────────────────────────────────────────────

const STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Walking: 0xaacc44,
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
const BAR_W = 50;
const BAR_H = 4;
const CARD_ICON_SIZE = 30;
const CARD_ICON_X = 3;
const CARD_CONTENT_X = CARD_ICON_X + CARD_ICON_SIZE + 6;
const TOOLTIP_ICON_SIZE = 40;

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

  /** The tooltip container — add to the top-level UI so it renders above everything. */
  readonly tooltipContainer: Container;

  private tooltipBg: Graphics;
  private tooltipBrackets: Graphics;
  private tooltipName: Text;
  private tooltipStars: Text;
  private tooltipLore: Text;
  private tooltipModel: Text;
  private tooltipStats1: Text;
  private tooltipStats2: Text;
  private tooltipState: Text;
  private tooltipMoraleLabel: Text;
  private tooltipMoraleBar: Graphics;
  private tooltipTurns: Text;
  private tooltipXP: Text;
  private hoveredAgent: AgentEntry | null = null;
  private tooltipIcon: Sprite | null = null;
  private tooltipIconBorder: Graphics;

  // Texture cache
  private iconTextures: Map<string, Texture> = new Map();
  private iconsLoaded = false;

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
    this.cardContainer.eventMode = 'static';
    this.container.addChild(this.cardContainer);

    // Tooltip hover events on the persistent cardContainer
    this.cardContainer.on('pointerout', () => this.hideAgentTooltip());

    this.drawPanel(0);

    // ── Tooltip (separate container for z-order) ──
    this.tooltipContainer = new Container();
    this.tooltipContainer.label = 'agent-tooltip';
    this.tooltipContainer.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipBrackets = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBrackets);

    this.tooltipName = new Text({ text: '', style: tooltipNameStyle });
    this.tooltipName.x = 10;
    this.tooltipName.y = 8;
    this.tooltipContainer.addChild(this.tooltipName);

    this.tooltipStars = new Text({ text: '', style: new TextStyle({ fontFamily: FONT, fontSize: 11, fill: 0xd4a017 }) });
    this.tooltipContainer.addChild(this.tooltipStars);

    this.tooltipLore = new Text({ text: '', style: tooltipLoreStyle });
    this.tooltipLore.x = 10;
    this.tooltipLore.y = 26;
    this.tooltipContainer.addChild(this.tooltipLore);

    this.tooltipModel = new Text({ text: '', style: tooltipModelStyle });
    this.tooltipModel.x = 10;
    this.tooltipModel.y = 42;
    this.tooltipContainer.addChild(this.tooltipModel);

    this.tooltipStats1 = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStats1.x = 10;
    this.tooltipStats1.y = 60;
    this.tooltipContainer.addChild(this.tooltipStats1);

    this.tooltipStats2 = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStats2.x = 10;
    this.tooltipStats2.y = 74;
    this.tooltipContainer.addChild(this.tooltipStats2);

    this.tooltipState = new Text({ text: '', style: tooltipStateStyle });
    this.tooltipState.x = 10;
    this.tooltipState.y = 92;
    this.tooltipContainer.addChild(this.tooltipState);

    this.tooltipMoraleLabel = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipMoraleLabel.x = 10;
    this.tooltipMoraleLabel.y = 108;
    this.tooltipContainer.addChild(this.tooltipMoraleLabel);

    this.tooltipMoraleBar = new Graphics();
    this.tooltipMoraleBar.y = 108;
    this.tooltipContainer.addChild(this.tooltipMoraleBar);

    this.tooltipTurns = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipTurns.x = 10;
    this.tooltipTurns.y = 124;
    this.tooltipContainer.addChild(this.tooltipTurns);

    this.tooltipXP = new Text({ text: '', style: tooltipLabelStyle });
    this.tooltipXP.x = 10;
    this.tooltipXP.y = 140;
    this.tooltipContainer.addChild(this.tooltipXP);

    // Tooltip profile icon border + sprite (added behind text)
    this.tooltipIconBorder = new Graphics();
    this.tooltipContainer.addChildAt(this.tooltipIconBorder, 2); // after bg and brackets

    this.loadIconTextures();
  }

  // ── Asset loading ───────────────────────────────────────────────

  private async loadIconTextures(): Promise<void> {
    try {
      const promises = Object.entries(TIER_ICONS).map(async ([_tier, file]) => {
        const tex = await Assets.load<Texture>(`/icons/agents/${file}`);
        tex.source.scaleMode = 'nearest';
        this.iconTextures.set(file, tex);
      });
      await Promise.all(promises);
      this.iconsLoaded = true;
      this.needsRebuild = true;
    } catch (err) {
      console.warn('[agents-hud] Failed to load icon textures:', err);
    }
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

    // If we were hovering an agent, refresh the tooltip with updated data
    // or hide it if that agent no longer exists
    if (this.hoveredAgent) {
      const updated = this.agents.get(this.hoveredAgent.id);
      if (updated) {
        this.showAgentTooltip(updated);
      } else {
        this.hideAgentTooltip();
      }
    }
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

    // Make card interactive for tooltip (pointerout is on the persistent cardContainer)
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.on('pointerover', () => this.showAgentTooltip(agent));
    card.on('pointermove', (e) => this.moveAgentTooltip(e.globalX, e.globalY));

    // Profile icon with circular border
    const iconCx = CARD_ICON_X + CARD_ICON_SIZE / 2;
    const iconCy = Math.round(CARD_HEIGHT / 2);
    const tierColor = TIER_COLORS[agent.tier];

    if (this.iconsLoaded) {
      const iconFile = TIER_ICONS[agent.tier];
      const tex = this.iconTextures.get(iconFile);
      if (tex) {
        const sprite = new Sprite(tex);
        sprite.width = CARD_ICON_SIZE - 4;
        sprite.height = CARD_ICON_SIZE - 4;
        sprite.x = CARD_ICON_X + 2;
        sprite.y = iconCy - (CARD_ICON_SIZE - 4) / 2;
        card.addChild(sprite);
      }
    }

    // Circular border around icon
    const iconBorder = new Graphics();
    iconBorder.circle(iconCx, iconCy, CARD_ICON_SIZE / 2);
    iconBorder.stroke({ color: isDead ? 0x333333 : tierColor, alpha: isDead ? 0.4 : 0.8, width: 2 });
    card.addChild(iconBorder);

    // State indicator dot (top-right of icon)
    const dot = new Graphics();
    const dotColor = STATE_COLORS[agent.state];
    dot.circle(CARD_ICON_X + CARD_ICON_SIZE - 2, CARD_ICON_X + 4, 3);
    dot.fill(dotColor);
    if (!isDead && (agent.state === 'Critical' || agent.state === 'Erroring')) {
      dot.circle(CARD_ICON_X + CARD_ICON_SIZE - 2, CARD_ICON_X + 4, 5);
      dot.stroke({ color: dotColor, alpha: 0.4, width: 1 });
    }
    card.addChild(dot);

    // Name
    const name = new Text({
      text: agent.name,
      style: isDead ? agentNameDeadStyle : agentNameStyle,
    });
    name.x = CARD_CONTENT_X;
    name.y = 2;
    card.addChild(name);

    // Star rating
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
    stateText.x = CARD_CONTENT_X;
    stateText.y = 16;
    card.addChild(stateText);

    // Mini health bar
    this.drawMiniBar(card, CARD_CONTENT_X, 28, agent.health_pct, isDead ? 0x222222 : 0x883333, isDead);

    // Mini morale bar
    this.drawMiniBar(card, CARD_CONTENT_X + BAR_W + 6, 28, agent.morale_pct, isDead ? 0x222222 : 0x887733, isDead);

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

  private showAgentTooltip(agent: AgentEntry): void {
    this.hoveredAgent = agent;

    // Tooltip profile icon
    const iconX = 10;
    const iconY = 8;
    const iconContentX = iconX + TOOLTIP_ICON_SIZE + 8;
    const tierColor = TIER_COLORS[agent.tier];

    // Remove old tooltip icon sprite if any
    if (this.tooltipIcon) {
      this.tooltipContainer.removeChild(this.tooltipIcon);
      this.tooltipIcon.destroy();
      this.tooltipIcon = null;
    }

    if (this.iconsLoaded) {
      const iconFile = TIER_ICONS[agent.tier];
      const tex = this.iconTextures.get(iconFile);
      if (tex) {
        this.tooltipIcon = new Sprite(tex);
        this.tooltipIcon.width = TOOLTIP_ICON_SIZE - 4;
        this.tooltipIcon.height = TOOLTIP_ICON_SIZE - 4;
        this.tooltipIcon.x = iconX + 2;
        this.tooltipIcon.y = iconY + 2;
        this.tooltipContainer.addChildAt(this.tooltipIcon, 3); // after bg, brackets, border
      }
    }

    // Circular border for tooltip icon
    const iconCx = iconX + TOOLTIP_ICON_SIZE / 2;
    const iconCy = iconY + TOOLTIP_ICON_SIZE / 2;
    this.tooltipIconBorder.clear();
    this.tooltipIconBorder.circle(iconCx, iconCy, TOOLTIP_ICON_SIZE / 2);
    this.tooltipIconBorder.stroke({ color: tierColor, alpha: 0.9, width: 2 });

    this.tooltipName.text = agent.name.toUpperCase();
    this.tooltipName.x = iconContentX;

    // Stars — position to the right of the name
    const starFull = '\u2605'.repeat(agent.stars);
    const starEmpty = '\u2606'.repeat(3 - agent.stars);
    this.tooltipStars.text = starFull + starEmpty;
    this.tooltipStars.x = TOOLTIP_W - this.tooltipStars.width - 10;
    this.tooltipStars.y = 10;

    this.tooltipLore.text = '\u201c' + agent.model_lore_name + '\u201d';
    this.tooltipLore.x = iconContentX;

    // Model name
    this.tooltipModel.text = TIER_MODEL_NAMES[agent.tier] + '  \u00b7  ' + agent.tier;
    this.tooltipModel.x = iconContentX;

    // Stats
    this.tooltipStats1.text = 'Tier: ' + agent.tier;
    this.tooltipStats2.text = 'Health: ' + Math.round(agent.health_pct * 100) + '%';

    // State with color
    const stateColor = STATE_COLORS[agent.state] ?? 0x9a9a8a;
    this.tooltipState.style.fill = stateColor;
    this.tooltipState.text = 'State: ' + (agent.state === 'Unresponsive' ? 'DEAD' : agent.state);

    // Morale
    const moralePct = Math.round(agent.morale_pct * 100);
    this.tooltipMoraleLabel.text = 'Morale:';

    // Morale bar — positioned after label with percentage at the end
    const barX = 54;
    const barW = 90;
    const barH = 6;
    this.tooltipMoraleBar.clear();
    this.tooltipMoraleBar.rect(barX, 3, barW, barH);
    this.tooltipMoraleBar.fill({ color: 0x1a1210, alpha: 0.9 });
    this.tooltipMoraleBar.rect(barX, 3, barW * agent.morale_pct, barH);
    this.tooltipMoraleBar.fill({ color: moralePct < 30 ? 0x883333 : 0x887733, alpha: 1.0 });

    // Morale percentage after bar
    const moralePctText = ' ' + moralePct + '%';
    this.tooltipMoraleLabel.text = 'Morale:' + ' '.repeat(24) + moralePctText;

    // Turns
    const turnRatio = agent.max_turns > 0 ? agent.turns_used / agent.max_turns : 0;
    const turnColor = turnRatio > 0.8 ? 0xaa3333 : 0x5a5a4a;
    this.tooltipTurns.style.fill = turnColor;
    this.tooltipTurns.text = 'Turns: ' + agent.turns_used + '/' + agent.max_turns;

    // XP
    this.tooltipXP.text = 'XP: ' + agent.xp + '  Lv.' + agent.level;

    // Resize tooltip background
    const tooltipH = 158;
    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.fill({ color: 0x0d0b08, alpha: 0.94 });
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.stroke({ color: 0x3a3020, alpha: 0.7, width: 1 });

    this.tooltipBrackets.clear();
    drawCornerBrackets(this.tooltipBrackets, 0, 0, TOOLTIP_W, tooltipH, 6, 0xd4a017, 0.35);

    this.tooltipContainer.visible = true;
  }

  private hideAgentTooltip(): void {
    this.hoveredAgent = null;
    this.tooltipContainer.visible = false;
  }

  private moveAgentTooltip(globalX: number, globalY: number): void {
    this.tooltipContainer.x = globalX + 16;
    this.tooltipContainer.y = globalY - 20;
  }
}
