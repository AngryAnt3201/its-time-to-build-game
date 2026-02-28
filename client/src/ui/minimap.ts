import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { terrainAt, TILE_PX, WORLD_ZOOM } from '../renderer/world';
import type { EntityDelta, AgentStateKind } from '../network/protocol';

// ── Constants ────────────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';
const MINI_SIZE = 180;
const MINI_TILE_SCALE = 2;   // 1 pixel = 2 tiles
const EXPAND_TILE_SCALE = 1; // 1 pixel = 1 tile
const REDRAW_INTERVAL = 30;  // frames between redraws

// ── Terrain color mapping ────────────────────────────────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

const TERRAIN_RGB: Record<string, RGB> = {
  water: hexToRgb('#2244aa'),
  stone: hexToRgb('#3a3a2a'),
  stone_dark: hexToRgb('#2a2a1a'),
  cliff_top: hexToRgb('#5a5a4a'),
  cliff_bot: hexToRgb('#5a5a4a'),
};
const DEFAULT_RGB: RGB = hexToRgb('#3a3a2a');
const FOG_RGB: RGB = [10, 10, 10];

// ── Entity colors ────────────────────────────────────────────────────

const AGENT_STATE_COLORS: Record<AgentStateKind, string> = {
  Idle: '#ccaa44',
  Building: '#44cc66',
  Erroring: '#ff6644',
  Exploring: '#6688cc',
  Defending: '#cc4444',
  Critical: '#ff0000',
  Unresponsive: '#444444',
};

const BUILDING_COLOR = '#d4a017';
const ROGUE_COLOR = '#cc4444';
const PLAYER_COLOR = '#ffffff';

// ── Agent tier icon mapping (for Canvas 2D) ─────────────────────────

const AGENT_TIER_ICON_FILES: Record<string, string> = {
  Apprentice: 'agent_1.png',
  Journeyman: 'agent_2.png',
  Artisan: 'agent_3.png',
  Architect: 'agent_4.png',
};

// ── Style ────────────────────────────────────────────────────────────

const labelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

// ── Tooltip styles (matching equipment HUD) ─────────────────────────

const TOOLTIP_W = 230;

const tooltipNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const tooltipSubStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x8a7a5a,
});

const tooltipDescStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x9a9a8a,
  wordWrap: true,
  wordWrapWidth: 210,
});

const tooltipStatStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a8a6a,
});

const zoomLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x5a5a4a,
});

// ── Corner bracket helper ────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics,
  x: number, y: number,
  w: number, h: number,
  size: number,
  color: number,
  alpha: number,
): void {
  gfx.moveTo(x, y + size);
  gfx.lineTo(x, y);
  gfx.lineTo(x + size, y);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + w - size, y);
  gfx.lineTo(x + w, y);
  gfx.lineTo(x + w, y + size);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + w, y + h - size);
  gfx.lineTo(x + w, y + h);
  gfx.lineTo(x + w - size, y + h);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + size, y + h);
  gfx.lineTo(x, y + h);
  gfx.lineTo(x, y + h - size);
  gfx.stroke({ color, alpha, width: 1.5 });
}

// ── Minimap class ────────────────────────────────────────────────────

export class Minimap {
  readonly container: Container;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapSprite: Sprite;
  private mapTexture: Texture;
  private panelBg: Graphics;
  private frameBrackets: Graphics;
  private labelText: Text;

  // Tooltip (separate container, added to uiContainer for z-ordering)
  readonly tooltipContainer: Container;
  private tooltipBg: Graphics;
  private tooltipBrackets: Graphics;
  private tooltipName: Text;
  private tooltipSub: Text;
  private tooltipDesc: Text;
  private tooltipStat: Text;

  // Zoom state (expanded mode only)
  private expandedTileScale = 1;
  private zoomLabel: Text;

  // Pan state (expanded mode only, in tile coordinates)
  private panOffsetTx = 0;
  private panOffsetTy = 0;
  private isPanning = false;
  private panStartX = 0;
  private panStartY = 0;

  // Cached rendering params for hit-testing (set during redraw)
  private lastStartTx = 0;
  private lastStartTy = 0;
  private lastTileScale = 1;

  private _expanded = false;
  private screenWidth = 0;
  private screenHeight = 0;
  private frameCounter = 0;

  // Fog of war: tracks explored tile coordinates as packed numbers
  // Uses a coarse grid (1 entry per 4 tiles) to keep memory manageable
  // Encoded as (tx << 16) | (ty & 0xFFFF)
  private exploredTiles: Set<number> = new Set();

  // Accumulated entity positions for drawing
  private allEntities: Map<number, EntityDelta> = new Map();
  private playerX = 0;
  private playerY = 0;

  // Agent tier icon images for Canvas 2D rendering
  private agentIconImages: Map<string, HTMLImageElement> = new Map();
  private agentIconsLoaded = false;

  get expanded(): boolean { return this._expanded; }
  get visible(): boolean { return this._expanded; }

  constructor() {
    this.container = new Container();
    this.container.label = 'minimap';

    // ── Offscreen canvas ────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINI_SIZE;
    this.canvas.height = MINI_SIZE;
    this.ctx = this.canvas.getContext('2d')!;

    // ── Panel background ────────────────────────────────────────────
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // ── Corner brackets ─────────────────────────────────────────────
    this.frameBrackets = new Graphics();
    this.container.addChild(this.frameBrackets);

    // ── Map sprite (displays the offscreen canvas) ──────────────────
    this.mapTexture = Texture.from(this.canvas);
    this.mapSprite = new Sprite(this.mapTexture);
    this.mapSprite.x = 8;
    this.mapSprite.y = 20;
    this.container.addChild(this.mapSprite);

    // ── Click to expand ─────────────────────────────────────────────
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.on('pointertap', () => {
      if (!this._expanded) {
        this.toggle();
      }
    });

    // ── Label ───────────────────────────────────────────────────────
    this.labelText = new Text({ text: 'MAP', style: labelStyle });
    this.labelText.x = 10;
    this.labelText.y = 4;
    this.container.addChild(this.labelText);

    // ── Tooltip (separate container for z-ordering above everything) ──
    this.tooltipContainer = new Container();
    this.tooltipContainer.label = 'minimap-tooltip';
    this.tooltipContainer.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipBrackets = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBrackets);

    this.tooltipName = new Text({ text: '', style: tooltipNameStyle });
    this.tooltipName.x = 10;
    this.tooltipName.y = 8;
    this.tooltipContainer.addChild(this.tooltipName);

    this.tooltipSub = new Text({ text: '', style: tooltipSubStyle });
    this.tooltipSub.x = 10;
    this.tooltipSub.y = 24;
    this.tooltipContainer.addChild(this.tooltipSub);

    this.tooltipDesc = new Text({ text: '', style: tooltipDescStyle });
    this.tooltipDesc.x = 10;
    this.tooltipDesc.y = 42;
    this.tooltipContainer.addChild(this.tooltipDesc);

    this.tooltipStat = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStat.x = 10;
    this.tooltipContainer.addChild(this.tooltipStat);

    // ── Zoom level label (bottom-right of map panel) ─────────────────
    this.zoomLabel = new Text({ text: '1.0x', style: zoomLabelStyle });
    this.zoomLabel.visible = false;
    this.container.addChild(this.zoomLabel);

    // ── Pointer events for tooltip and panning ─────────────────────────
    this.container.on('pointermove', (e) => {
      if (!this._expanded) return;

      if (this.isPanning) {
        const dx = e.globalX - this.panStartX;
        const dy = e.globalY - this.panStartY;
        this.panStartX = e.globalX;
        this.panStartY = e.globalY;
        // Convert pixel drag to tile offset
        this.panOffsetTx -= dx * this.expandedTileScale;
        this.panOffsetTy -= dy * this.expandedTileScale;
        this.frameCounter = REDRAW_INTERVAL; // force redraw
        this.tooltipContainer.visible = false;
        return;
      }

      this.handlePointerMove(e.globalX, e.globalY);
    });
    this.container.on('pointerdown', (e) => {
      if (!this._expanded) return;
      this.isPanning = true;
      this.panStartX = e.globalX;
      this.panStartY = e.globalY;
      this.container.cursor = 'grabbing';
    });
    this.container.on('pointerup', () => {
      this.isPanning = false;
      this.container.cursor = 'pointer';
    });
    this.container.on('pointerupoutside', () => {
      this.isPanning = false;
      this.container.cursor = 'pointer';
    });
    this.container.on('pointerleave', () => {
      this.isPanning = false;
      this.container.cursor = 'pointer';
      this.tooltipContainer.visible = false;
    });

    this.drawPanel();
    this.loadAgentIcons();
  }

  private loadAgentIcons(): void {
    const tiers = Object.keys(AGENT_TIER_ICON_FILES);
    let loaded = 0;
    for (const tier of tiers) {
      const img = new Image();
      img.src = `/icons/agents/${AGENT_TIER_ICON_FILES[tier]}`;
      img.onload = () => {
        this.agentIconImages.set(tier, img);
        loaded++;
        if (loaded === tiers.length) this.agentIconsLoaded = true;
      };
    }
  }

  // ── Panel drawing ─────────────────────────────────────────────────

  private drawPanel(): void {
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const panelW = canvasW + 16;
    const panelH = canvasH + 28;

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.82 });
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.6, width: 1 });

    this.frameBrackets.clear();
    drawCornerBrackets(this.frameBrackets, 0, 0, panelW, panelH, 10, 0xd4a017, 0.4);

    this.mapSprite.x = 8;
    this.mapSprite.y = 20;
    if (this.zoomLabel) {
      this.zoomLabel.x = panelW - 36;
      this.zoomLabel.y = panelH - 14;
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.reposition();
  }

  toggle(): void {
    this._expanded = !this._expanded;

    if (this._expanded) {
      const expandW = Math.floor(this.screenWidth * 0.6);
      const expandH = Math.floor(this.screenHeight * 0.6);
      this.canvas.width = expandW;
      this.canvas.height = expandH;
    } else {
      this.canvas.width = MINI_SIZE;
      this.canvas.height = MINI_SIZE;
    }

    this.mapTexture.destroy();
    this.mapTexture = Texture.from(this.canvas);
    this.mapSprite.texture = this.mapTexture;

    this.drawPanel();
    this.zoomLabel.visible = this._expanded;
    if (this._expanded) {
      this.expandedTileScale = EXPAND_TILE_SCALE;
      this.panOffsetTx = 0;
      this.panOffsetTy = 0;
      this.updateZoomLabel();
    }
    this.reposition();

    // Force immediate redraw
    this.frameCounter = REDRAW_INTERVAL;
  }

  close(): void {
    this.tooltipContainer.visible = false;
    if (this._expanded) {
      this.toggle();
    }
  }

  zoomIn(): void {
    if (!this._expanded) return;
    this.expandedTileScale = Math.max(0.1, this.expandedTileScale / 1.25);
    this.updateZoomLabel();
    this.frameCounter = REDRAW_INTERVAL; // force redraw
  }

  zoomOut(): void {
    if (!this._expanded) return;
    this.expandedTileScale = Math.min(4, this.expandedTileScale * 1.25);
    this.updateZoomLabel();
    this.frameCounter = REDRAW_INTERVAL; // force redraw
  }

  private updateZoomLabel(): void {
    const displayScale = 1 / this.expandedTileScale;
    this.zoomLabel.text = `${displayScale.toFixed(1)}x`;
  }

  /**
   * Called every frame from the game loop.
   * Accumulates entity data and redraws the minimap every REDRAW_INTERVAL frames.
   */
  update(
    playerX: number,
    playerY: number,
    changedEntities: EntityDelta[],
    removedEntityIds: number[],
  ): void {
    this.playerX = playerX;
    this.playerY = playerY;

    // Accumulate entity state
    for (const entity of changedEntities) {
      this.allEntities.set(entity.id, entity);
    }
    for (const id of removedEntityIds) {
      this.allEntities.delete(id);
    }

    // Mark nearby tiles as explored (coarse grid: every 4 tiles)
    const ptx = Math.floor(playerX / TILE_PX);
    const pty = Math.floor(playerY / TILE_PX);
    const exploreRadius = 20;
    for (let dy = -exploreRadius; dy <= exploreRadius; dy += 4) {
      for (let dx = -exploreRadius; dx <= exploreRadius; dx += 4) {
        const tx = ptx + dx;
        const ty = pty + dy;
        this.exploredTiles.add((tx << 16) | (ty & 0xFFFF));
      }
    }

    // Throttled redraw
    this.frameCounter++;
    if (this.frameCounter >= REDRAW_INTERVAL) {
      this.frameCounter = 0;
      this.redraw();
    }
  }

  // ── Positioning ───────────────────────────────────────────────────

  private reposition(): void {
    const panelW = this.canvas.width + 16;
    const panelH = this.canvas.height + 28;

    if (this._expanded) {
      this.container.x = Math.floor((this.screenWidth - panelW) / 2);
      this.container.y = Math.floor((this.screenHeight - panelH) / 2);
    } else {
      this.container.x = this.screenWidth - panelW - 16;
      this.container.y = this.screenHeight - panelH - 16;
    }
  }

  // ── Tooltip hit-testing ────────────────────────────────────────────

  private handlePointerMove(globalX: number, globalY: number): void {
    const mapLeftScreen = this.container.x + 8;
    const mapTopScreen = this.container.y + 20;
    const localPx = globalX - mapLeftScreen;
    const localPy = globalY - mapTopScreen;

    const w = this.canvas.width;
    const h = this.canvas.height;

    if (localPx < 0 || localPx >= w || localPy < 0 || localPy >= h) {
      this.tooltipContainer.visible = false;
      return;
    }

    const tileScale = this.lastTileScale;
    const tx = this.lastStartTx + localPx * tileScale;
    const ty = this.lastStartTy + localPy * tileScale;

    // Check proximity to player first
    const playerTx = this.playerX / TILE_PX;
    const playerTy = this.playerY / TILE_PX;
    const playerDist = Math.abs(tx - playerTx) + Math.abs(ty - playerTy);
    if (playerDist < 3) {
      this.showEntityTooltip(globalX, globalY, {
        name: 'Player',
        sub: '',
        desc: `Position: (${Math.floor(this.playerX)}, ${Math.floor(this.playerY)})`,
        stat: '',
      });
      return;
    }

    // Find closest entity within 3 tiles
    let closest: EntityDelta | null = null;
    let closestDist = 3;

    for (const entity of this.allEntities.values()) {
      const etx = entity.position.x / TILE_PX;
      const ety = entity.position.y / TILE_PX;
      const dist = Math.abs(tx - etx) + Math.abs(ty - ety);
      if (dist < closestDist) {
        closestDist = dist;
        closest = entity;
      }
    }

    if (!closest) {
      this.tooltipContainer.visible = false;
      return;
    }

    if ('Agent' in closest.data) {
      const a = closest.data.Agent;
      const hp = Math.round(a.health_pct * 100);
      const morale = Math.round(a.morale_pct * 100);
      this.showEntityTooltip(globalX, globalY, {
        name: a.name,
        sub: `${a.tier} Agent`,
        desc: `State: ${a.state}`,
        stat: `HP: ${hp}%  Morale: ${morale}%`,
      });
    } else if ('Building' in closest.data) {
      const b = closest.data.Building;
      const conPct = Math.round(b.construction_pct * 100);
      const hp = Math.round(b.health_pct * 100);
      const isComplete = b.construction_pct >= 1.0;
      this.showEntityTooltip(globalX, globalY, {
        name: b.building_type,
        sub: isComplete ? 'Complete' : `Under Construction ${conPct}%`,
        desc: isComplete ? 'Operational' : 'Building in progress...',
        stat: `HP: ${hp}%  Construction: ${isComplete ? 'Complete' : conPct + '%'}`,
      });
    } else if ('Rogue' in closest.data) {
      const r = closest.data.Rogue;
      const hp = Math.round(r.health_pct * 100);
      const level = r.rogue_type === 'Swarm' || r.rogue_type === 'TokenDrain' ? 1
        : r.rogue_type === 'Assassin' || r.rogue_type === 'Architect' ? 3 : 2;
      const stars = '\u2605'.repeat(level);
      this.showEntityTooltip(globalX, globalY, {
        name: r.rogue_type,
        sub: `${stars} Rogue`,
        desc: 'Hostile entity',
        stat: `HP: ${hp}%  Level: ${stars}`,
      });
    }
  }

  private showEntityTooltip(
    globalX: number,
    globalY: number,
    info: { name: string; sub: string; desc: string; stat: string },
  ): void {
    this.tooltipName.text = info.name;
    this.tooltipSub.text = info.sub;
    this.tooltipDesc.text = info.desc;
    this.tooltipStat.text = info.stat;

    const descBottom = this.tooltipDesc.y + this.tooltipDesc.height;
    this.tooltipStat.y = descBottom + 6;

    const tooltipH = info.stat
      ? this.tooltipStat.y + this.tooltipStat.height + 10
      : descBottom + 10;

    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.fill({ color: 0x0d0b08, alpha: 0.94 });
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.stroke({ color: 0x3a3020, alpha: 0.7, width: 1 });

    this.tooltipBrackets.clear();
    drawCornerBrackets(this.tooltipBrackets, 0, 0, TOOLTIP_W, tooltipH, 6, 0xd4a017, 0.35);

    this.tooltipContainer.x = globalX + 16;
    this.tooltipContainer.y = globalY - 20;
    this.tooltipContainer.visible = true;
  }

  // ── Canvas rendering ──────────────────────────────────────────────

  private redraw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const tileScale = this._expanded ? this.expandedTileScale : MINI_TILE_SCALE;

    // Player tile position (center of map), offset by pan
    const tilePx = TILE_PX; // local alias for hot loop
    const centerTx = Math.floor(this.playerX / tilePx) + (this._expanded ? this.panOffsetTx : 0);
    const centerTy = Math.floor(this.playerY / tilePx) + (this._expanded ? this.panOffsetTy : 0);

    // How many tiles the canvas covers
    const tilesWide = w * tileScale;
    const tilesHigh = h * tileScale;
    const startTx = centerTx - Math.floor(tilesWide / 2);
    const startTy = centerTy - Math.floor(tilesHigh / 2);

    // Cache for hit-testing
    this.lastStartTx = startTx;
    this.lastStartTy = startTy;
    this.lastTileScale = tileScale;

    // ── Draw terrain + fog ──────────────────────────────────────────
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const tx = startTx + px * tileScale;
        const ty = startTy + py * tileScale;

        // Check fog (coarse grid: round to nearest 4)
        const fogTx = Math.round(tx / 4) * 4;
        const fogTy = Math.round(ty / 4) * 4;
        const explored = this.exploredTiles.has((fogTx << 16) | (fogTy & 0xFFFF));

        let r: number, g: number, b: number;

        if (!explored) {
          [r, g, b] = FOG_RGB;
        } else {
          const terrain = terrainAt(tx, ty);
          [r, g, b] = TERRAIN_RGB[terrain] || DEFAULT_RGB;
        }

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // ── Draw entities ───────────────────────────────────────────────
    for (const entity of this.allEntities.values()) {
      const etx = entity.position.x / tilePx;
      const ety = entity.position.y / tilePx;

      const mpx = (etx - startTx) / tileScale;
      const mpy = (ety - startTy) / tileScale;

      if (mpx < 0 || mpx >= w || mpy < 0 || mpy >= h) continue;

      const dotSize = this._expanded ? 3 : 2;

      if ('Agent' in entity.data) {
        const tier = entity.data.Agent.tier;
        const img = this.agentIconImages.get(tier);
        if (img && this.agentIconsLoaded) {
          const iconSize = this._expanded ? 8 : 5;
          const half = Math.floor(iconSize / 2);
          ctx.drawImage(img, Math.floor(mpx) - half, Math.floor(mpy) - half, iconSize, iconSize);
        } else {
          const color = AGENT_STATE_COLORS[entity.data.Agent.state];
          ctx.fillStyle = color;
          ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize, dotSize);
        }
      } else if ('Building' in entity.data) {
        ctx.fillStyle = BUILDING_COLOR;
        ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize + 1, dotSize + 1);
      } else if ('Rogue' in entity.data) {
        ctx.fillStyle = ROGUE_COLOR;
        ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize, dotSize);
      }
    }

    // ── Draw player ─────────────────────────────────────────────────
    const playerTx = this.playerX / tilePx;
    const playerTy = this.playerY / tilePx;
    const playerMpx = Math.floor((playerTx - startTx) / tileScale);
    const playerMpy = Math.floor((playerTy - startTy) / tileScale);
    const playerDotSize = this._expanded ? 5 : 3;
    const half = Math.floor(playerDotSize / 2);

    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(playerMpx - half, playerMpy - half, playerDotSize, playerDotSize);

    // ── Draw viewport rect (expanded mode only) ─────────────────────
    if (this._expanded) {
      const viewTilesW = this.screenWidth / (TILE_PX * WORLD_ZOOM);
      const viewTilesH = this.screenHeight / (TILE_PX * WORLD_ZOOM);

      const rectX = playerMpx - (viewTilesW / tileScale / 2);
      const rectY = playerMpy - (viewTilesH / tileScale / 2);
      const rectW = viewTilesW / tileScale;
      const rectH = viewTilesH / tileScale;

      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(rectX), Math.floor(rectY), Math.floor(rectW), Math.floor(rectH));
    }

    // ── Update PixiJS texture ───────────────────────────────────────
    this.mapTexture.source.update();
  }
}
