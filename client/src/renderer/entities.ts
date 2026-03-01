import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { EntityDelta, AgentStateKind, AgentTierKind, RogueTypeKind, ProjectileData, BuildingGradeState } from '../network/protocol';

// ── Internal sprite type ────────────────────────────────────────────

interface EntitySprite {
  container: Container;
  graphic: Graphics;
  label: Text;
  /** Stars label shown below building name tags. */
  starsLabel: Text;
  /** Sprite used for rogue skull icons (loaded async). */
  iconSprite: Sprite | null;
  /** Sprite used for building artwork. */
  buildingSprite: Sprite | null;
  /** Health bar graphics for rogues. */
  healthBarBg: Graphics | null;
  healthBarFill: Graphics | null;
}

// ── Color maps ──────────────────────────────────────────────────────

const AGENT_STATE_COLORS: Record<AgentStateKind, number> = {
  Idle: 0xccaa44,
  Walking: 0x88ccff,
  Building: 0x44cc66,
  Erroring: 0xff6644,
  Exploring: 0x6688cc,
  Defending: 0xcc4444,
  Critical: 0xff0000,
  Unresponsive: 0x444444,
  Dormant: 0x666688,
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

// ── Building sprite file mapping ──────────────────────────────────

const SERVER_SPRITES = [
  '/buildings/server_1.png',
  '/buildings/server_2.png',
  '/buildings/server_3.png',
  '/buildings/server_4.png',
  '/buildings/server_5.png',
];

const BUILDING_SPRITE_MAP: Record<string, string> = {
  TokenWheel: '/buildings/wheel_contraption.png',
  CraftingTable: '/buildings/workbench_1.png',
  Pylon: '/buildings/pylon.png',
  ComputeFarm: '/buildings/compute_farm.png',
};

// ── Agent tier icon mapping ────────────────────────────────────────

const AGENT_TIER_ICONS: Record<AgentTierKind, string> = {
  Apprentice: 'agent_1.png',
  Journeyman: 'agent_2.png',
  Artisan: 'agent_3.png',
  Architect: 'agent_4.png',
};

// ── Rogue level mapping ─────────────────────────────────────────────
// Level 1 (weakest): Swarm, TokenDrain
// Level 2 (medium): Corruptor, Looper, Mimic
// Level 3 (strongest): Assassin, Architect

const ROGUE_LEVEL: Record<RogueTypeKind, 1 | 2 | 3> = {
  Swarm: 1,
  TokenDrain: 1,
  Corruptor: 2,
  Looper: 2,
  Mimic: 2,
  Assassin: 3,
  Architect: 3,
};

// ── Health bar config for enemies ────────────────────────────────────

const ENEMY_BAR_W = 20;
const ENEMY_BAR_H = 3;
const ENEMY_BAR_Y_OFFSET = -16; // above the skull icon

// ── Label style helper ──────────────────────────────────────────────
// Render at 3x resolution to match WORLD_ZOOM so labels stay crisp.
const LABEL_RES = 3;

function makeLabelStyle(color: number): TextStyle {
  return new TextStyle({
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: 7 * LABEL_RES,
    fill: color,
  });
}

// ── Shape drawing helpers ───────────────────────────────────────────

function drawCircle(gfx: Graphics, color: number, radius: number): void {
  gfx.circle(0, 0, radius);
  gfx.fill(color);
}

function drawSquare(gfx: Graphics, color: number, size: number, outline: boolean, fillPct: number): void {
  const half = size / 2;
  if (outline) {
    gfx.rect(-half, -half, size, size);
    gfx.stroke({ color, width: 2 });
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

export class EntityRenderer {
  readonly container: Container;
  private sprites: Map<number, EntitySprite> = new Map();

  // Building grades for star display
  private buildingGrades: Record<string, BuildingGradeState> = {};
  // Wheel tier for TokenWheel star display
  private wheelTierStars = 1;

  // Cached skull textures (loaded once)
  private skullTextures: Map<number, Texture> = new Map();
  private skullsLoaded = false;

  // Cached agent tier textures (loaded once)
  private agentTextures: Map<AgentTierKind, Texture> = new Map();
  private agentIconsLoaded = false;

  // Cached building textures (loaded once)
  private buildingTextures: Map<string, Texture> = new Map();
  private buildingsLoaded = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'entities';
    this.loadSkullIcons();
    this.loadAgentIcons();
    this.loadBuildingSprites();
  }

  /** Update the building grades map (called each tick from main). */
  setBuildingGrades(grades: Record<string, BuildingGradeState>): void {
    this.buildingGrades = grades;
  }

  /** Update the wheel tier for TokenWheel star display. */
  setWheelTier(tier: string): void {
    const map: Record<string, number> = { HandCrank: 1, GearAssembly: 2, WaterWheel: 3, RunicEngine: 4 };
    this.wheelTierStars = map[tier] ?? 1;
  }

  // ── Load skull icon textures ──────────────────────────────────────

  private async loadSkullIcons(): Promise<void> {
    try {
      const [skull1, skull2, skull3] = await Promise.all([
        Assets.load<Texture>('/icons/enemies/enemy_level_1.png'),
        Assets.load<Texture>('/icons/enemies/enemy_level_2.png'),
        Assets.load<Texture>('/icons/enemies/enemy_level_3.png'),
      ]);

      skull1.source.scaleMode = 'nearest';
      skull2.source.scaleMode = 'nearest';
      skull3.source.scaleMode = 'nearest';

      this.skullTextures.set(1, skull1);
      this.skullTextures.set(2, skull2);
      this.skullTextures.set(3, skull3);
      this.skullsLoaded = true;
    } catch (err) {
      console.warn('[entities] Failed to load skull icons:', err);
    }
  }

  private async loadAgentIcons(): Promise<void> {
    try {
      const tiers: AgentTierKind[] = ['Apprentice', 'Journeyman', 'Artisan', 'Architect'];
      const textures = await Promise.all(
        tiers.map(tier => Assets.load<Texture>(`/icons/agents/${AGENT_TIER_ICONS[tier]}`)),
      );
      for (let i = 0; i < tiers.length; i++) {
        textures[i].source.scaleMode = 'nearest';
        this.agentTextures.set(tiers[i], textures[i]);
      }
      this.agentIconsLoaded = true;
    } catch (err) {
      console.warn('[entities] Failed to load agent icons:', err);
    }
  }

  private async loadBuildingSprites(): Promise<void> {
    try {
      const allPaths = [
        ...SERVER_SPRITES,
        ...Object.values(BUILDING_SPRITE_MAP),
      ];
      const textures = await Promise.all(
        allPaths.map(p => Assets.load<Texture>(p)),
      );
      for (let i = 0; i < allPaths.length; i++) {
        textures[i].source.scaleMode = 'nearest';
        this.buildingTextures.set(allPaths[i], textures[i]);
      }
      this.buildingsLoaded = true;
    } catch (err) {
      console.warn('[entities] Failed to load building sprites:', err);
    }
  }

  /** Pick a building texture path for a given entity ID + building type. */
  private getBuildingTexturePath(entityId: number, buildingType: string): string {
    const mapped = BUILDING_SPRITE_MAP[buildingType];
    if (mapped) return mapped;
    // Deterministic random server sprite based on entity ID
    return SERVER_SPRITES[entityId % SERVER_SPRITES.length];
  }

  /**
   * Update visible entities.
   */
  update(changed: EntityDelta[], removed: number[]): void {
    // Remove despawned entities
    for (const id of removed) {
      const sprite = this.sprites.get(id);
      if (sprite) {
        this.container.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
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
        this.drawBuilding(sprite, delta.data.Building, delta.id);
      } else if ('Rogue' in delta.data) {
        this.drawRogue(sprite, delta.data.Rogue);
      } else if ('Item' in delta.data) {
        this.drawItem(sprite, delta.data.Item);
      } else if ('Projectile' in delta.data) {
        this.drawProjectile(sprite, delta.data.Projectile);
      }
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) {
      this.container.removeChild(sprite.container);
      sprite.container.destroy({ children: true });
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
    label.scale.set(1 / LABEL_RES);
    label.y = 10;

    const starsLabel = new Text({
      text: '',
      style: makeLabelStyle(0xd4a017),
    });
    starsLabel.anchor.set(0.5, 0);
    starsLabel.scale.set(1 / LABEL_RES);
    starsLabel.y = 17;
    starsLabel.visible = false;

    container.addChild(graphic);
    container.addChild(label);
    container.addChild(starsLabel);

    return { container, graphic, label, starsLabel, iconSprite: null, buildingSprite: null, healthBarBg: null, healthBarFill: null };
  }

  private drawAgent(
    sprite: EntitySprite,
    agent: { name: string; state: AgentStateKind; tier: AgentTierKind; morale_pct: number; bound?: boolean },
  ): void {
    const color = AGENT_STATE_COLORS[agent.state];
    const g = sprite.graphic;

    // Bound agent visual: pulsing cyan glow (drawn first so it appears behind the icon)
    if (agent.bound) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      const glowAlpha = 0.3 + 0.4 * pulse;
      g.circle(0, 0, 14);
      g.fill({ color: 0x00ccff, alpha: glowAlpha });
    }

    // Agent tier icon sprite
    if (this.agentIconsLoaded) {
      const tex = this.agentTextures.get(agent.tier);
      if (tex) {
        if (!sprite.iconSprite) {
          sprite.iconSprite = new Sprite(tex);
          sprite.iconSprite.width = 16;
          sprite.iconSprite.height = 16;
          sprite.iconSprite.anchor.set(0.5, 0.5);
          sprite.container.addChild(sprite.iconSprite);
        } else {
          sprite.iconSprite.texture = tex;
          sprite.iconSprite.visible = true;
        }
      }
    } else {
      // Fallback: draw circle if icons haven't loaded yet
      drawCircle(sprite.graphic, color, 6);
    }

    // State-colored ring around icon
    sprite.graphic.circle(0, 0, 10);
    sprite.graphic.stroke({ color, width: 1.5 });

    // Dim dormant (recruitable) agents; pulse bound agents
    if (agent.bound) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
      sprite.container.alpha = 0.8 + 0.2 * pulse;
    } else if (agent.state === 'Dormant') {
      sprite.container.alpha = 0.6;
    } else {
      sprite.container.alpha = 1.0;
    }

    if (agent.morale_pct < 0.3) {
      sprite.graphic.circle(0, 0, 12);
      sprite.graphic.stroke({ color: 0xff0000, width: 1.5 });
    }

    sprite.label.text = agent.name;
    sprite.label.y = 10;
    sprite.label.style = makeLabelStyle(color);
    sprite.starsLabel.visible = false;

    // Clean up rogue/building-specific elements
    if (sprite.healthBarBg) sprite.healthBarBg.clear();
    if (sprite.healthBarFill) sprite.healthBarFill.clear();
    this.cleanBuildingElements(sprite);
  }

  private drawBuilding(
    sprite: EntitySprite,
    building: { building_type: string; construction_pct: number },
    entityId: number,
  ): void {
    const isComplete = building.construction_pct >= 1.0;
    const BUILDING_SPRITE_SIZE = 32;

    if (this.buildingsLoaded) {
      const texPath = this.getBuildingTexturePath(entityId, building.building_type);
      const tex = this.buildingTextures.get(texPath);
      if (tex) {
        if (!sprite.buildingSprite) {
          sprite.buildingSprite = new Sprite(tex);
          sprite.buildingSprite.width = BUILDING_SPRITE_SIZE;
          sprite.buildingSprite.height = BUILDING_SPRITE_SIZE;
          sprite.buildingSprite.anchor.set(0.5, 0.5);
          sprite.container.addChild(sprite.buildingSprite);
        } else {
          sprite.buildingSprite.texture = tex;
          sprite.buildingSprite.visible = true;
          sprite.buildingSprite.width = BUILDING_SPRITE_SIZE;
          sprite.buildingSprite.height = BUILDING_SPRITE_SIZE;
        }

        if (isComplete) {
          sprite.buildingSprite.alpha = 1.0;
        } else {
          // Semi-transparent while under construction
          sprite.buildingSprite.alpha = 0.3 + 0.7 * building.construction_pct;
        }
      }
    } else {
      // Fallback: gold box while sprites load
      const size = 12;
      drawSquare(sprite.graphic, BUILDING_COLOR, size, !isComplete, isComplete ? 1.0 : building.construction_pct);
    }

    // Adjust label position for larger sprite
    sprite.label.text = building.building_type;
    sprite.label.style = makeLabelStyle(BUILDING_COLOR);
    sprite.label.y = BUILDING_SPRITE_SIZE / 2 + 2;

    // Show star rating below name — skip for infrastructure & crafting table
    const noStarsTypes = ['Pylon', 'ComputeFarm', 'CraftingTable'];
    if (noStarsTypes.includes(building.building_type)) {
      sprite.starsLabel.visible = false;
    } else if (building.building_type === 'TokenWheel') {
      // TokenWheel uses wheel upgrade tier for stars (4 max)
      let stars = '';
      for (let i = 1; i <= 4; i++) {
        stars += i <= this.wheelTierStars ? '\u2605' : '\u2606';
      }
      sprite.starsLabel.text = stars;
      sprite.starsLabel.style = makeLabelStyle(0xd4a017);
      sprite.starsLabel.y = BUILDING_SPRITE_SIZE / 2 + 9;
      sprite.starsLabel.visible = true;
    } else {
      const buildingId = building.building_type
        .replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      const grade = this.buildingGrades[buildingId];
      const starCount = (grade && !grade.grading) ? grade.stars : 0;
      let stars = '';
      for (let i = 1; i <= 6; i++) {
        stars += i <= starCount ? '\u2605' : '\u2606';
      }
      sprite.starsLabel.text = stars;
      sprite.starsLabel.style = makeLabelStyle(0xd4a017);
      sprite.starsLabel.y = BUILDING_SPRITE_SIZE / 2 + 9;
      sprite.starsLabel.visible = true;
    }

    this.cleanRogueElements(sprite);
  }

  private drawRogue(
    sprite: EntitySprite,
    rogue: { rogue_type: RogueTypeKind; health_pct: number },
  ): void {
    const level = ROGUE_LEVEL[rogue.rogue_type];
    const color = ROGUE_TYPE_COLORS[rogue.rogue_type];

    // ── Skull icon sprite ─────────────────────────────────────────
    if (this.skullsLoaded) {
      const tex = this.skullTextures.get(level);
      if (tex) {
        if (!sprite.iconSprite) {
          sprite.iconSprite = new Sprite(tex);
          sprite.iconSprite.width = 16;
          sprite.iconSprite.height = 16;
          sprite.iconSprite.anchor.set(0.5, 0.5);
          sprite.container.addChild(sprite.iconSprite);
        } else {
          sprite.iconSprite.texture = tex;
          sprite.iconSprite.visible = true;
        }
      }
    } else {
      // Fallback: draw diamond if skulls haven't loaded yet
      sprite.graphic.moveTo(0, -7);
      sprite.graphic.lineTo(7, 0);
      sprite.graphic.lineTo(0, 7);
      sprite.graphic.lineTo(-7, 0);
      sprite.graphic.closePath();
      sprite.graphic.fill(color);
    }

    // ── Health bar above enemy ────────────────────────────────────
    if (!sprite.healthBarBg) {
      sprite.healthBarBg = new Graphics();
      sprite.healthBarBg.y = ENEMY_BAR_Y_OFFSET;
      sprite.container.addChild(sprite.healthBarBg);
    }
    if (!sprite.healthBarFill) {
      sprite.healthBarFill = new Graphics();
      sprite.healthBarFill.y = ENEMY_BAR_Y_OFFSET;
      sprite.container.addChild(sprite.healthBarFill);
    }

    // Draw health bar background
    sprite.healthBarBg.clear();
    sprite.healthBarBg.rect(-ENEMY_BAR_W / 2, 0, ENEMY_BAR_W, ENEMY_BAR_H);
    sprite.healthBarBg.fill({ color: 0x1a1210, alpha: 0.9 });
    sprite.healthBarBg.rect(-ENEMY_BAR_W / 2, 0, ENEMY_BAR_W, ENEMY_BAR_H);
    sprite.healthBarBg.stroke({ color: 0x3a2a1a, alpha: 0.6, width: 0.5 });

    // Draw health bar fill
    const pct = Math.max(0, Math.min(1, rogue.health_pct));
    const fillW = Math.round(pct * ENEMY_BAR_W);
    sprite.healthBarFill.clear();
    if (fillW > 0) {
      // Color based on health percentage
      let barColor: number;
      if (pct > 0.6) barColor = 0xcc4444;
      else if (pct > 0.3) barColor = 0xcc6644;
      else barColor = 0x882222;

      sprite.healthBarFill.rect(-ENEMY_BAR_W / 2, 0, fillW, ENEMY_BAR_H);
      sprite.healthBarFill.fill(barColor);
    }

    // ── Label with level indicator ────────────────────────────────
    const levelStars = '★'.repeat(level);
    sprite.label.text = `${levelStars} ${rogue.rogue_type}`;
    sprite.label.y = 10;
    sprite.label.style = makeLabelStyle(color);
    sprite.starsLabel.visible = false;
    this.cleanBuildingElements(sprite);
  }

  private drawItem(
    sprite: EntitySprite,
    item: { item_type: string },
  ): void {
    drawStar(sprite.graphic, ITEM_COLOR, 6);

    sprite.label.text = item.item_type;
    sprite.label.y = 10;
    sprite.label.style = makeLabelStyle(ITEM_COLOR);

    this.cleanRogueElements(sprite);
    this.cleanBuildingElements(sprite);
  }

  private drawProjectile(
    sprite: EntitySprite,
    proj: ProjectileData,
  ): void {
    const len = 4;
    sprite.graphic.moveTo(-proj.dx * len, -proj.dy * len);
    sprite.graphic.lineTo(proj.dx * len, proj.dy * len);
    sprite.graphic.stroke({ color: 0x44ccff, alpha: 0.9, width: 2 });
    // Bright tip
    sprite.graphic.circle(proj.dx * len * 0.5, proj.dy * len * 0.5, 1.5);
    sprite.graphic.fill({ color: 0xaaeeff, alpha: 1.0 });
    sprite.label.text = '';
    this.cleanRogueElements(sprite);
    this.cleanBuildingElements(sprite);
  }

  /** Remove rogue/building-specific elements when entity changes type. */
  private cleanRogueElements(sprite: EntitySprite): void {
    if (sprite.iconSprite) {
      sprite.iconSprite.visible = false;
    }
    if (sprite.healthBarBg) {
      sprite.healthBarBg.clear();
    }
    if (sprite.healthBarFill) {
      sprite.healthBarFill.clear();
    }
    // starsLabel is managed by drawBuilding — hide for non-buildings handled there
  }

  /** Hide building sprite when entity is not a building. */
  private cleanBuildingElements(sprite: EntitySprite): void {
    if (sprite.buildingSprite) {
      sprite.buildingSprite.visible = false;
    }
  }
}
