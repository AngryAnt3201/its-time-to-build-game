import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';

// ── Constants ───────────────────────────────────────────────────────
const CHUNK_SIZE = 32;
export const TILE_PX = 16;

export const WORLD_ZOOM = 3;

// ── Spritesheet layout ─────────────────────────────────────────────
const GROUND_COLS = 26; // Ground_rocks: 416×1392
const WATER_COLS = 23;  // water_coasts:  368×976
const DETAIL_COLS = 40; // details:       640×224

// ── Tile indices ────────────────────────────────────────────────────
// ONLY use index 54 for flat ground — confirmed from TMX as center fill.
// All other nearby indices (55, 80, 81 etc.) are cliff EDGE tiles!
const GROUND_FILL = 54; // (col 2, row 2) — the ONLY confirmed flat stone

const WATER_FILL = 22;  // water_coasts (col 22, row 0) — solid water

// Cliff wall face tiles from Ground_rocks rows 8-9
// These represent the south-facing vertical cliff wall seen from above.
const CLIFF_TOP_TILES = [
  208, 209, 210, 211, 212, 213, // row 8, cols 0-5
];
const CLIFF_BOT_TILES = [
  234, 235, 236, 237, 238, 239, // row 9, cols 0-5
];

// Water coast auto-tile (from water_coasts sheet)
const COAST_TILES: Record<string, number> = {
  fill:      22,   // solid water
  n:         28,   // land to north
  s:         70,   // land to south
  e:         50,   // land to east
  w:         47,   // land to west
  nw:        24,   // land to NW
  ne:        27,   // land to NE
  sw:        70,   // land to SW (reuse s)
  se:        73,   // land to SE
  inner_nw:  93,   // inner corner NW
  inner_ne:  96,   // inner corner NE
  inner_sw:  93,   // inner corner SW (reuse)
  inner_se:  96,   // inner corner SE (reuse)
  ns:        47,   // narrow vertical
  ew:        28,   // narrow horizontal
};

// Detail tile indices from TMX
const DETAIL_TWIGS = [69, 70, 115];
const DETAIL_TREES = [164, 165, 166, 204, 205, 206];
const DETAIL_GROUND = [41, 42, 43, 44, 81, 82, 83, 84];
const ALL_DETAILS = [...DETAIL_TWIGS, ...DETAIL_TREES, ...DETAIL_GROUND];

// ── Object definitions ──────────────────────────────────────────────
interface ObjectDef {
  path: string;
  size: number;
  tileCover: number;
}

const OBJECTS_SMALL: ObjectDef[] = [
  { path: 'grave1.png', size: 32, tileCover: 2 },
  { path: 'grave2.png', size: 32, tileCover: 2 },
  { path: 'grave3.png', size: 32, tileCover: 2 },
  { path: 'grave4.png', size: 32, tileCover: 2 },
  { path: 'grave5.png', size: 32, tileCover: 2 },
  { path: 'bones1.png', size: 32, tileCover: 2 },
  { path: 'bones2.png', size: 16, tileCover: 1 },
  { path: 'bones3.png', size: 32, tileCover: 2 },
  { path: 'bones4.png', size: 32, tileCover: 2 },
  { path: 'bones5.png', size: 32, tileCover: 2 },
  { path: 'skull_door.png', size: 64, tileCover: 4 },
];

const OBJECTS_MEDIUM: ObjectDef[] = [
  { path: 'crystal1.png', size: 64, tileCover: 4 },
  { path: 'crystal2.png', size: 64, tileCover: 4 },
  { path: 'crystal3.png', size: 64, tileCover: 4 },
  { path: 'rock1.png', size: 64, tileCover: 4 },
  { path: 'rock2.png', size: 64, tileCover: 4 },
  { path: 'rock3.png', size: 64, tileCover: 4 },
];

const OBJECTS_LARGE: ObjectDef[] = [
  { path: 'tree1.png', size: 128, tileCover: 8 },
  { path: 'tree2.png', size: 64, tileCover: 4 },
  { path: 'tree3.png', size: 64, tileCover: 4 },
  { path: 'dead_tree1.png', size: 128, tileCover: 8 },
  { path: 'dead_tree2.png', size: 128, tileCover: 8 },
  { path: 'dead_tree3.png', size: 128, tileCover: 8 },
  { path: 'broken_tree1.png', size: 128, tileCover: 8 },
  { path: 'broken_tree2.png', size: 128, tileCover: 8 },
  { path: 'broken_tree3.png', size: 128, tileCover: 8 },
  { path: 'ruin1.png', size: 128, tileCover: 8 },
  { path: 'ruin2.png', size: 128, tileCover: 8 },
  { path: 'ruin3.png', size: 128, tileCover: 8 },
  { path: 'plant1.png', size: 128, tileCover: 8 },
  { path: 'plant2.png', size: 128, tileCover: 8 },
  { path: 'plant3.png', size: 128, tileCover: 8 },
  { path: 'thorn1.png', size: 128, tileCover: 8 },
  { path: 'thorn2.png', size: 128, tileCover: 8 },
  { path: 'thorn3.png', size: 128, tileCover: 8 },
  { path: 'skull_pile.png', size: 128, tileCover: 8 },
];

const ALL_OBJECTS = [...OBJECTS_SMALL, ...OBJECTS_MEDIUM, ...OBJECTS_LARGE];

// ── Hash & noise ────────────────────────────────────────────────────
export function hash(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

function noise(x: number, y: number, scale: number, seed = 0): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = sx - ix;
  const fy = sy - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const n00 = (hash(ix, iy, seed) & 0xffff) / 0xffff;
  const n10 = (hash(ix + 1, iy, seed) & 0xffff) / 0xffff;
  const n01 = (hash(ix, iy + 1, seed) & 0xffff) / 0xffff;
  const n11 = (hash(ix + 1, iy + 1, seed) & 0xffff) / 0xffff;
  return (n00 * (1 - ux) + n10 * ux) * (1 - uy) +
         (n01 * (1 - ux) + n11 * ux) * uy;
}

function fbm(x: number, y: number, scale: number, seed: number, octaves = 3): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    val += noise(x * freq, y * freq, scale, seed + i * 1000) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return val / total;
}

// ── Terrain thresholds ──────────────────────────────────────────────
// High values = rarer features = more flat ground.
const WATER_THRESHOLD = 0.68;   // was 0.62 — much less water now
const ELEV_THRESHOLD = 0.72;    // was 0.58-0.65 — cliffs are rare landmarks

// ── Terrain queries (exported for collision) ────────────────────────

export function isWater(wx: number, wy: number): boolean {
  return fbm(wx, wy, 20, 777) > WATER_THRESHOLD;
}

export function elevation(wx: number, wy: number): number {
  return fbm(wx, wy, 16, 333);
}

/** Is this tile elevated ground? (walkable, but creates cliff below it) */
function isElevatedTile(wx: number, wy: number): boolean {
  return elevation(wx, wy) >= ELEV_THRESHOLD;
}

/**
 * Edge-based terrain classification.
 * Cliffs only appear at EDGES of elevated terrain, not as random bands.
 * - cliff_top: tile directly below an elevated tile (first row of cliff face)
 * - cliff_bot: tile directly below cliff_top (second row of cliff face)
 * - Everything else is flat walkable stone ground.
 */
export function terrainAt(wx: number, wy: number): string {
  if (isWater(wx, wy)) return 'water';

  // If this tile itself is elevated, it's just high ground (walkable stone)
  if (isElevatedTile(wx, wy)) return 'stone';

  // Edge detection: check tile above for cliff face placement
  // cliff_top = directly below elevated edge
  if (isElevatedTile(wx, wy - 1)) return 'cliff_top';

  // cliff_bot = second row below elevated edge
  // (tile above is cliff_top, tile 2 above is elevated)
  if (isElevatedTile(wx, wy - 2) && !isElevatedTile(wx, wy - 1)) return 'cliff_bot';

  // All other ground: subtle variation via noise
  const dark = fbm(wx, wy, 10, 555) > 0.65;
  return dark ? 'stone_dark' : 'stone';
}

export function isWalkable(wx: number, wy: number): boolean {
  const t = terrainAt(wx, wy);
  return t !== 'water' && t !== 'cliff_top' && t !== 'cliff_bot';
}

export function pixelToTile(px: number, py: number): { tx: number; ty: number } {
  return { tx: Math.floor(px / TILE_PX), ty: Math.floor(py / TILE_PX) };
}

function tintWithBrightness(baseTint: number, brightness: number): number {
  const r = Math.min(255, Math.floor(((baseTint >> 16) & 0xff) * brightness));
  const g = Math.min(255, Math.floor(((baseTint >> 8) & 0xff) * brightness));
  const b = Math.min(255, Math.floor((baseTint & 0xff) * brightness));
  return (r << 16) | (g << 8) | b;
}

// ── Chunk data ──────────────────────────────────────────────────────
interface ChunkData {
  container: Container;
  groundLayer: Container;
  objectLayer: Container;
  debugLayer: Container;
}

// ── WorldRenderer ───────────────────────────────────────────────────

export class WorldRenderer {
  readonly container: Container;

  private chunks: Map<string, ChunkData> = new Map();
  private groundTiles: Map<number, Texture> = new Map();
  private waterTiles: Map<number, Texture> = new Map();
  private detailTiles: Map<number, Texture> = new Map();
  private objectTextures: Map<string, Texture> = new Map();
  private loaded = false;
  private viewDistance = 3;
  private _debugBoundaries = false;
  /** Set of "wx,wy" keys for chests that have been opened and should not render. */
  private _openedChests: Set<string> = new Set();

  constructor() {
    this.container = new Container();
    this.container.label = 'world';
  }

  // ── Debug boundary toggle ──────────────────────────────────────────

  get debugBoundaries(): boolean { return this._debugBoundaries; }

  toggleDebugBoundaries(): void {
    this._debugBoundaries = !this._debugBoundaries;
    for (const chunk of this.chunks.values()) {
      chunk.debugLayer.visible = this._debugBoundaries;
    }
    console.log(`[world] Debug boundaries: ${this._debugBoundaries ? 'ON' : 'OFF'}`);
  }

  // ── Asset loading ─────────────────────────────────────────────────

  async loadAssets(): Promise<void> {
    const [groundTex, waterTex, detailTex] = await Promise.all([
      Assets.load<Texture>('/tiles/ground_rocks.png'),
      Assets.load<Texture>('/tiles/water_coasts.png'),
      Assets.load<Texture>('/tiles/details.png'),
    ]);

    groundTex.source.scaleMode = 'nearest';
    waterTex.source.scaleMode = 'nearest';
    detailTex.source.scaleMode = 'nearest';

    const groundIndices = [
      GROUND_FILL,
      ...CLIFF_TOP_TILES, ...CLIFF_BOT_TILES,
    ];
    const waterIndices = [
      WATER_FILL,
      ...Object.values(COAST_TILES),
    ];

    this.groundTiles = this.sliceTiles(groundTex, GROUND_COLS, groundIndices);
    this.waterTiles = this.sliceTiles(waterTex, WATER_COLS, waterIndices);
    this.detailTiles = this.sliceTiles(detailTex, DETAIL_COLS, ALL_DETAILS);

    const objectPromises = ALL_OBJECTS.map(async (obj) => {
      const tex = await Assets.load<Texture>(`/tiles/objects/${obj.path}`);
      tex.source.scaleMode = 'nearest';
      this.objectTextures.set(obj.path, tex);
    });
    await Promise.all(objectPromises);

    this.loaded = true;
    console.log(
      `[world] Loaded: ${this.groundTiles.size} ground, ` +
      `${this.waterTiles.size} water, ${this.detailTiles.size} detail, ` +
      `${this.objectTextures.size} objects`,
    );
  }

  private sliceTiles(baseTex: Texture, cols: number, indices: number[]): Map<number, Texture> {
    const map = new Map<number, Texture>();
    const srcW = baseTex.width;
    const srcH = baseTex.height;
    for (const idx of indices) {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const px = col * TILE_PX;
      const py = row * TILE_PX;
      if (px + TILE_PX > srcW || py + TILE_PX > srcH) continue;
      map.set(idx, new Texture({ source: baseTex.source, frame: new Rectangle(px, py, TILE_PX, TILE_PX) }));
    }
    return map;
  }

  // ── Chunk lifecycle ───────────────────────────────────────────────

  updateVisibleChunks(worldX: number, worldY: number): void {
    if (!this.loaded) return;

    const ccx = Math.floor(worldX / (CHUNK_SIZE * TILE_PX));
    const ccy = Math.floor(worldY / (CHUNK_SIZE * TILE_PX));
    const active = new Set<string>();

    for (let dy = -this.viewDistance; dy <= this.viewDistance; dy++) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx++) {
        const cx = ccx + dx;
        const cy = ccy + dy;
        const key = `${cx},${cy}`;
        active.add(key);
        if (!this.chunks.has(key)) this.buildChunk(cx, cy);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!active.has(key)) {
        this.container.removeChild(chunk.container);
        chunk.container.destroy({ children: true });
        this.chunks.delete(key);
      }
    }
  }

  // ── Chunk generation ──────────────────────────────────────────────

  private buildChunk(cx: number, cy: number): void {
    const root = new Container();
    root.x = cx * CHUNK_SIZE * TILE_PX;
    root.y = cy * CHUNK_SIZE * TILE_PX;

    const groundLayer = new Container();
    const objectLayer = new Container();
    const debugLayer = new Container();
    debugLayer.visible = this._debugBoundaries;

    root.addChild(groundLayer);
    root.addChild(objectLayer);
    root.addChild(debugLayer);

    for (let ty = 0; ty < CHUNK_SIZE; ty++) {
      for (let tx = 0; tx < CHUNK_SIZE; tx++) {
        const wx = cx * CHUNK_SIZE + tx;
        const wy = cy * CHUNK_SIZE + ty;

        const terrain = terrainAt(wx, wy);

        // Distance fog
        const dist = Math.sqrt(wx * wx + wy * wy);
        const fog = Math.max(0.12, 1.0 - dist / 250);

        // Per-tile brightness jitter
        const jitter = 0.93 + (hash(wx, wy, 7777) % 14) / 100; // 0.93–1.06

        // Pick texture and tint based on terrain type
        let tex: Texture | undefined;
        let baseTint = 0xdddddd;

        if (terrain === 'water') {
          const coastIdx = this.pickCoastTile(wx, wy);
          tex = this.waterTiles.get(coastIdx);
          baseTint = 0xffffff;
        } else if (terrain === 'cliff_top') {
          const ci = hash(wx, wy, 800) % CLIFF_TOP_TILES.length;
          tex = this.groundTiles.get(CLIFF_TOP_TILES[ci]);
          baseTint = 0xffffff;
        } else if (terrain === 'cliff_bot') {
          const ci = hash(wx, wy, 801) % CLIFF_BOT_TILES.length;
          tex = this.groundTiles.get(CLIFF_BOT_TILES[ci]);
          baseTint = 0xffffff;
        } else if (terrain === 'stone_dark') {
          tex = this.groundTiles.get(GROUND_FILL);
          baseTint = 0xbbbbbb;
        } else {
          // stone — the main ground tile
          tex = this.groundTiles.get(GROUND_FILL);
          baseTint = 0xdddddd;
        }

        // Fallback: always use the confirmed ground tile, never Texture.WHITE
        if (!tex) tex = this.groundTiles.get(GROUND_FILL)!;

        const spr = new Sprite(tex);
        spr.x = tx * TILE_PX;
        spr.y = ty * TILE_PX;
        spr.tint = tintWithBrightness(baseTint, fog * jitter);
        groundLayer.addChild(spr);

        // Detail scatter on walkable ground
        if (terrain === 'stone' || terrain === 'stone_dark') {
          const detailRoll = hash(wx, wy, 9999) % 100;
          if (detailRoll < 15) {
            this.placeDetail(groundLayer, wx, wy, tx, ty, fog);
          }
        }

        // Debug: red overlay on non-walkable tiles
        if (!isWalkable(wx, wy)) {
          const dbg = new Graphics();
          dbg.rect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
          dbg.stroke({ color: 0xff0000, width: 1, alpha: 0.7 });
          dbg.rect(tx * TILE_PX + 1, ty * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
          dbg.fill({ color: 0xff0000, alpha: 0.15 });
          debugLayer.addChild(dbg);
        }
      }
    }

    this.scatterObjects(objectLayer, cx, cy);

    this.container.addChild(root);
    this.chunks.set(`${cx},${cy}`, { container: root, groundLayer, objectLayer, debugLayer });
  }

  // ── Water coast auto-tile ─────────────────────────────────────────

  private pickCoastTile(wx: number, wy: number): number {
    const n = isWater(wx, wy - 1);
    const s = isWater(wx, wy + 1);
    const e = isWater(wx + 1, wy);
    const w = isWater(wx - 1, wy);

    if (n && s && e && w) {
      const dne = isWater(wx + 1, wy - 1);
      const dnw = isWater(wx - 1, wy - 1);
      const dse = isWater(wx + 1, wy + 1);
      const dsw = isWater(wx - 1, wy + 1);
      if (!dnw) return COAST_TILES.inner_nw;
      if (!dne) return COAST_TILES.inner_ne;
      if (!dsw) return COAST_TILES.inner_sw;
      if (!dse) return COAST_TILES.inner_se;
      return COAST_TILES.fill;
    }

    if (!n &&  s &&  e &&  w) return COAST_TILES.n;
    if ( n && !s &&  e &&  w) return COAST_TILES.s;
    if ( n &&  s && !e &&  w) return COAST_TILES.e;
    if ( n &&  s &&  e && !w) return COAST_TILES.w;

    if (!n && !w &&  s &&  e) return COAST_TILES.nw;
    if (!n && !e &&  s &&  w) return COAST_TILES.ne;
    if (!s && !w &&  n &&  e) return COAST_TILES.sw;
    if (!s && !e &&  n &&  w) return COAST_TILES.se;

    if (!n && !s &&  e &&  w) return COAST_TILES.ew;
    if ( n &&  s && !e && !w) return COAST_TILES.ns;

    return COAST_TILES.fill;
  }

  // ── Detail scatter ────────────────────────────────────────────────

  private placeDetail(
    layer: Container,
    wx: number, wy: number,
    tx: number, ty: number,
    fog: number,
  ): void {
    const r = hash(wx, wy, 5555);
    let pool: number[];
    const kind = r % 6;
    if (kind < 3) pool = DETAIL_GROUND;
    else if (kind < 5) pool = DETAIL_TWIGS;
    else pool = DETAIL_TREES;

    const idx = pool[r % pool.length];
    const tex = this.detailTiles.get(idx);
    if (!tex) return;

    const spr = new Sprite(tex);
    spr.x = tx * TILE_PX;
    spr.y = ty * TILE_PX;
    spr.tint = tintWithBrightness(0xffffff, fog);
    spr.alpha = 0.85;
    layer.addChild(spr);
  }

  // ── Object scatter ────────────────────────────────────────────────

  private scatterObjects(layer: Container, cx: number, cy: number): void {
    this.placeObjectGrid(layer, cx, cy, 4, OBJECTS_SMALL, 30, 1001);
    this.placeObjectGrid(layer, cx, cy, 8, OBJECTS_MEDIUM, 20, 2002);
    this.placeObjectGrid(layer, cx, cy, 12, OBJECTS_LARGE, 12, 3003);
    this.placeChests(layer, cx, cy);
  }

  private placeObjectGrid(
    layer: Container,
    cx: number, cy: number,
    step: number,
    pool: ObjectDef[],
    chance: number,
    seed: number,
  ): void {
    for (let ty = 0; ty < CHUNK_SIZE; ty += step) {
      for (let tx = 0; tx < CHUNK_SIZE; tx += step) {
        const wx = cx * CHUNK_SIZE + tx;
        const wy = cy * CHUNK_SIZE + ty;

        if (!isWalkable(wx, wy)) continue;

        const roll = hash(wx, wy, seed) % 1000;
        if (roll >= chance) continue;

        const objDef = pool[hash(wx, wy, seed + 100) % pool.length];
        const tex = this.objectTextures.get(objDef.path);
        if (!tex) continue;

        const spr = new Sprite(tex);
        const offsetX = ((hash(wx, wy, seed + 200) % 16) - 8);
        const offsetY = ((hash(wx, wy, seed + 300) % 16) - 8);
        spr.x = tx * TILE_PX + offsetX - objDef.size / 2 + TILE_PX / 2;
        spr.y = ty * TILE_PX + offsetY - objDef.size / 2 + TILE_PX / 2;

        const dist = Math.sqrt(wx * wx + wy * wy);
        const fog = Math.max(0.12, 1.0 - dist / 250);
        spr.tint = tintWithBrightness(0xffffff, fog);
        spr.alpha = 0.95;

        layer.addChild(spr);
      }
    }
  }

  // ── Chest placement ──────────────────────────────────────────────

  private placeChests(layer: Container, cx: number, cy: number): void {
    const CHEST_SEED = 55555;
    const STEP = 8; // check every 8 tiles → 16 candidates per chunk

    for (let ty = 0; ty < CHUNK_SIZE; ty += STEP) {
      for (let tx = 0; tx < CHUNK_SIZE; tx += STEP) {
        const wx = cx * CHUNK_SIZE + tx;
        const wy = cy * CHUNK_SIZE + ty;

        if (!isWalkable(wx, wy)) continue;

        // ~10% chance per candidate = ~1-2 chests per chunk
        const roll = hash(wx, wy, CHEST_SEED) % 100;
        if (roll >= 10) continue;

        // Skip already-opened chests
        if (this._openedChests.has(`${wx},${wy}`)) continue;

        const tex = this.objectTextures.get('crystal2.png');
        if (!tex) continue;

        // Glow circle behind the chest
        const glow = new Graphics();
        const glowX = tx * TILE_PX + TILE_PX / 2;
        const glowY = ty * TILE_PX + TILE_PX / 2;
        glow.circle(glowX, glowY, 20);
        glow.fill({ color: 0xd4a017, alpha: 0.15 });
        glow.circle(glowX, glowY, 12);
        glow.fill({ color: 0xd4a017, alpha: 0.2 });
        glow.label = `chest_glow_${wx}_${wy}`;
        layer.addChild(glow);

        const spr = new Sprite(tex);

        // Slight random offset for natural feel (±4 pixels)
        const offsetX = ((hash(wx, wy, CHEST_SEED + 200) % 9) - 4);
        const offsetY = ((hash(wx, wy, CHEST_SEED + 300) % 9) - 4);

        spr.width = 36;
        spr.height = 36;
        spr.x = tx * TILE_PX + offsetX - 18 + TILE_PX / 2;
        spr.y = ty * TILE_PX + offsetY - 18 + TILE_PX / 2;

        // Bright golden tint — no distance fog so chests are always visible
        spr.tint = 0xd4a017;
        spr.alpha = 1.0;

        spr.label = `chest_${wx}_${wy}`;

        layer.addChild(spr);
      }
    }
  }

  /** Remove an opened chest sprite and its glow from the rendered world. */
  removeChest(wx: number, wy: number): void {
    this._openedChests.add(`${wx},${wy}`);

    // Find which chunk this chest belongs to
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cy = Math.floor(wy / CHUNK_SIZE);
    const chunk = this.chunks.get(`${cx},${cy}`);
    if (!chunk) return;

    const spriteLabel = `chest_${wx}_${wy}`;
    const glowLabel = `chest_glow_${wx}_${wy}`;
    const toRemove: Container[] = [];
    for (const child of chunk.objectLayer.children) {
      if (child.label === spriteLabel || child.label === glowLabel) {
        toRemove.push(child as Container);
      }
    }
    for (const child of toRemove) {
      chunk.objectLayer.removeChild(child);
      child.destroy();
    }
  }

  // ── Server-driven API (preserved) ─────────────────────────────────

  renderChunkTerrain(cx: number, cy: number, terrain: string[][], lightLevels: number[][]): void {
    if (!this.loaded) return;

    const key = `${cx},${cy}`;
    const existing = this.chunks.get(key);
    if (existing) {
      this.container.removeChild(existing.container);
      existing.container.destroy({ children: true });
    }

    const root = new Container();
    root.x = cx * CHUNK_SIZE * TILE_PX;
    root.y = cy * CHUNK_SIZE * TILE_PX;

    const groundLayer = new Container();
    root.addChild(groundLayer);

    for (let ty = 0; ty < CHUNK_SIZE; ty++) {
      for (let tx = 0; tx < CHUNK_SIZE; tx++) {
        const type = terrain[ty]?.[tx] ?? 'stone';
        const light = lightLevels[ty]?.[tx] ?? 0;
        const brightness = 0.1 + light * 0.9;

        const tex = this.groundTiles.get(GROUND_FILL) ?? Texture.WHITE;
        const spr = new Sprite(tex);
        spr.x = tx * TILE_PX;
        spr.y = ty * TILE_PX;
        spr.tint = tintWithBrightness(type === 'stone_dark' ? 0xbbbbbb : 0xdddddd, brightness);
        groundLayer.addChild(spr);
      }
    }

    const objectLayer = new Container();
    const debugLayer = new Container();
    debugLayer.visible = this._debugBoundaries;
    root.addChild(objectLayer);
    root.addChild(debugLayer);

    this.container.addChild(root);
    this.chunks.set(key, { container: root, groundLayer, objectLayer, debugLayer });
  }

  removeChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.container.removeChild(chunk.container);
      chunk.container.destroy({ children: true });
      this.chunks.delete(key);
    }
  }

  clear(): void {
    for (const chunk of this.chunks.values()) {
      this.container.removeChild(chunk.container);
      chunk.container.destroy({ children: true });
    }
    this.chunks.clear();
  }
}
