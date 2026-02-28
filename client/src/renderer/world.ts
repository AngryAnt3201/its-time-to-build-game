import { Container, Graphics } from 'pixi.js';

const CHUNK_SIZE = 32;
const TILE_SIZE = 16;

// Terrain colors (base colors before lighting is applied)
const TERRAIN_COLORS: Record<string, number> = {
  grass: 0x3a7d44,
  stone: 0x808080,
  water: 0x2a6fdb,
  dirt: 0x8b6914,
};

// Default terrain color if type is unrecognized
const DEFAULT_COLOR = 0x3a7d44;

/** Dim a hex color by a factor (0 = black, 1 = full brightness). */
function dimColor(color: number, factor: number): number {
  const r = Math.floor(((color >> 16) & 0xff) * factor);
  const g = Math.floor(((color >> 8) & 0xff) * factor);
  const b = Math.floor((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

export interface ChunkTerrain {
  cx: number;
  cy: number;
  tiles: string[][]; // CHUNK_SIZE x CHUNK_SIZE array of terrain type strings
}

/**
 * Client-side world renderer.
 *
 * Renders chunk terrain using PixiJS Graphics objects. Each chunk is cached
 * as a single Graphics object to avoid re-drawing unchanged chunks.
 */
export class WorldRenderer {
  readonly container: Container;

  // Cache of rendered chunk graphics, keyed by "cx,cy"
  private chunkCache: Map<string, Graphics> = new Map();

  constructor() {
    this.container = new Container();
    this.container.label = 'world';
  }

  /**
   * Render (or update) a chunk's terrain with lighting applied.
   *
   * @param cx - Chunk X coordinate
   * @param cy - Chunk Y coordinate
   * @param terrain - 2D array of terrain type strings (CHUNK_SIZE x CHUNK_SIZE)
   * @param lightLevels - 2D array of light levels (0.0 = unlit, 1.0 = fully lit)
   */
  renderChunkTerrain(
    cx: number,
    cy: number,
    terrain: string[][],
    lightLevels: number[][],
  ): void {
    const key = `${cx},${cy}`;

    // Remove old cached graphic if it exists
    const existing = this.chunkCache.get(key);
    if (existing) {
      this.container.removeChild(existing);
      existing.destroy();
    }

    const gfx = new Graphics();

    // Position the chunk in world space
    gfx.x = cx * CHUNK_SIZE * TILE_SIZE;
    gfx.y = cy * CHUNK_SIZE * TILE_SIZE;

    for (let ty = 0; ty < CHUNK_SIZE; ty++) {
      for (let tx = 0; tx < CHUNK_SIZE; tx++) {
        const terrainType = terrain[ty]?.[tx] ?? 'grass';
        const baseColor = TERRAIN_COLORS[terrainType] ?? DEFAULT_COLOR;

        // Light level determines brightness: 0.1 (fog) to 1.0 (fully lit)
        const light = lightLevels[ty]?.[tx] ?? 0;
        const brightness = 0.1 + light * 0.9; // minimum 10% brightness for revealed tiles
        const color = dimColor(baseColor, brightness);

        gfx.rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        gfx.fill(color);
      }
    }

    this.container.addChild(gfx);
    this.chunkCache.set(key, gfx);
  }

  /**
   * Remove a chunk's cached rendering.
   */
  removeChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    const existing = this.chunkCache.get(key);
    if (existing) {
      this.container.removeChild(existing);
      existing.destroy();
      this.chunkCache.delete(key);
    }
  }

  /**
   * Clear all cached chunk graphics.
   */
  clear(): void {
    for (const gfx of this.chunkCache.values()) {
      this.container.removeChild(gfx);
      gfx.destroy();
    }
    this.chunkCache.clear();
  }
}
