import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { EntityDelta, AgentStateKind, RogueTypeKind } from '../network/protocol';

// ── Internal sprite type ────────────────────────────────────────────

interface EntitySprite {
  container: Container;
  graphic: Graphics;
  label: Text;
}

// ── Color maps ──────────────────────────────────────────────────────

const AGENT_STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x444444,
};

const ROGUE_TYPE_COLORS: Record<RogueTypeKind, number> = {
  Corruptor: 0xcc44cc,
  Looper: 0x44cccc,
  TokenDrain: 0x88cc44,
  Assassin: 0xff2222,
  Swarm: 0x886644,
  Mimic: 0xd4a017,
  Architect: 0x8844cc,
};

const ITEM_COLOR = 0xffdd44;
const BUILDING_COLOR = 0xd4a017;

// ── Label style helper ──────────────────────────────────────────────

function makeLabelStyle(color: number): TextStyle {
  return new TextStyle({
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 10,
    fill: color,
  });
}

// ── Hex color to CSS string ─────────────────────────────────────────

function hexToString(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// ── Shape drawing helpers ───────────────────────────────────────────

function drawCircle(gfx: Graphics, color: number, radius: number): void {
  gfx.circle(0, 0, radius);
  gfx.fill(color);
}

function drawSquare(gfx: Graphics, color: number, size: number, outline: boolean, fillPct: number): void {
  const half = size / 2;
  if (outline) {
    // Draw outline
    gfx.rect(-half, -half, size, size);
    gfx.stroke({ color, width: 2 });
    // Draw progress fill from bottom up
    if (fillPct > 0) {
      const fillHeight = size * fillPct;
      gfx.rect(-half, half - fillHeight, size, fillHeight);
      gfx.fill(color);
    }
  } else {
    gfx.rect(-half, -half, size, size);
    gfx.fill(color);
  }
}

function drawDiamond(gfx: Graphics, color: number, radius: number): void {
  gfx.moveTo(0, -radius);
  gfx.lineTo(radius, 0);
  gfx.lineTo(0, radius);
  gfx.lineTo(-radius, 0);
  gfx.closePath();
  gfx.fill(color);
}

function drawStar(gfx: Graphics, color: number, outerRadius: number): void {
  const innerRadius = outerRadius * 0.4;
  const points = 5;
  const step = Math.PI / points;

  gfx.moveTo(0, -outerRadius);
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + step * i;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    gfx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  gfx.closePath();
  gfx.fill(color);
}

// ── EntityRenderer ──────────────────────────────────────────────────

/**
 * Renders game entities (agents, buildings, rogues, items) as
 * color-coded placeholder geometric shapes.
 */
export class EntityRenderer {
  readonly container: Container;
  private sprites: Map<number, EntitySprite> = new Map();

  constructor() {
    this.container = new Container();
    this.container.label = 'entities';
  }

  /**
   * Update visible entities.
   *
   * @param changed - Entities that have been created or changed this tick
   * @param removed - Entity IDs that have been despawned
   */
  update(changed: EntityDelta[], removed: number[]): void {
    // Remove despawned entities
    for (const id of removed) {
      const sprite = this.sprites.get(id);
      if (sprite) {
        this.container.removeChild(sprite.container);
        sprite.graphic.destroy();
        sprite.label.destroy();
        sprite.container.destroy();
        this.sprites.delete(id);
      }
    }

    // Create or update changed entities
    for (const delta of changed) {
      let sprite = this.sprites.get(delta.id);

      if (!sprite) {
        sprite = this.createSprite();
        this.sprites.set(delta.id, sprite);
        this.container.addChild(sprite.container);
      }

      // Update position
      sprite.container.x = delta.position.x;
      sprite.container.y = delta.position.y;

      // Redraw visual based on entity type
      sprite.graphic.clear();

      if ('Agent' in delta.data) {
        this.drawAgent(sprite, delta.data.Agent);
      } else if ('Building' in delta.data) {
        this.drawBuilding(sprite, delta.data.Building);
      } else if ('Rogue' in delta.data) {
        this.drawRogue(sprite, delta.data.Rogue);
      } else if ('Item' in delta.data) {
        this.drawItem(sprite, delta.data.Item);
      }
    }
  }

  /**
   * Remove all entity sprites and clear the map.
   */
  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.container.removeChild(sprite.container);
      sprite.graphic.destroy();
      sprite.label.destroy();
      sprite.container.destroy();
    }
    this.sprites.clear();
  }

  // ── Private helpers ─────────────────────────────────────────────

  private createSprite(): EntitySprite {
    const container = new Container();
    const graphic = new Graphics();
    const label = new Text({
      text: '',
      style: makeLabelStyle(0xffffff),
    });
    label.anchor.set(0.5, 0);
    label.y = 10; // Position label below the shape

    container.addChild(graphic);
    container.addChild(label);

    return { container, graphic, label };
  }

  private drawAgent(
    sprite: EntitySprite,
    agent: { name: string; state: AgentStateKind; morale_pct: number },
  ): void {
    const color = AGENT_STATE_COLORS[agent.state];
    const radius = 6;

    // Draw main circle
    drawCircle(sprite.graphic, color, radius);

    // Low morale indicator: red ring
    if (agent.morale_pct < 0.3) {
      sprite.graphic.circle(0, 0, radius + 2);
      sprite.graphic.stroke({ color: 0xff0000, width: 1.5 });
    }

    // Update label
    sprite.label.text = `[${agent.name}]`;
    sprite.label.style = makeLabelStyle(color);
  }

  private drawBuilding(
    sprite: EntitySprite,
    building: { building_type: string; construction_pct: number },
  ): void {
    const size = 12;
    const isComplete = building.construction_pct >= 1.0;

    drawSquare(
      sprite.graphic,
      BUILDING_COLOR,
      size,
      !isComplete,
      isComplete ? 1.0 : building.construction_pct,
    );

    // Update label
    sprite.label.text = building.building_type;
    sprite.label.style = makeLabelStyle(BUILDING_COLOR);
  }

  private drawRogue(
    sprite: EntitySprite,
    rogue: { rogue_type: RogueTypeKind },
  ): void {
    const color = ROGUE_TYPE_COLORS[rogue.rogue_type];
    const radius = 7;

    drawDiamond(sprite.graphic, color, radius);

    // Update label
    sprite.label.text = rogue.rogue_type;
    sprite.label.style = makeLabelStyle(color);
  }

  private drawItem(
    sprite: EntitySprite,
    item: { item_type: string },
  ): void {
    drawStar(sprite.graphic, ITEM_COLOR, 6);

    // Update label
    sprite.label.text = item.item_type;
    sprite.label.style = makeLabelStyle(ITEM_COLOR);
  }
}
