import { Container, Graphics } from 'pixi.js';

/**
 * Client-side fog of war renderer.
 *
 * Multiple stacked darkness layers with progressively smaller cutouts
 * create a smooth gradient from fully lit center → dim penumbra → pitch
 * black fog. Each layer is a separate Graphics to avoid PixiJS batching
 * issues. PixiJS 8 cut() order: rect → fill → circle → cut.
 *
 * Gradient zones (from center outward):
 *   Bright core   (< 0.6× radius):  fully lit
 *   Inner glow    (0.6–0.8× radius): subtle dim
 *   Mid penumbra  (0.8–1.0× radius): noticeable dim
 *   Outer penumbra(1.0–1.3× radius): quite dark
 *   Deep fog      (1.3–1.6× radius): very dark
 *   Total darkness(> 1.6× radius):   pitch black
 */
/** A light source with optional colored ring. */
export interface LightSource {
  x: number;
  y: number;
  radius: number;
  /** If set, draws a visible glowing ring at the light boundary. */
  ringColor?: number;
}

export class LightingRenderer {
  readonly container: Container;

  // 5 darkness layers from outermost (largest cutouts) to innermost
  private layers: Graphics[] = [];
  private static readonly LAYER_CONFIG: Array<{ radiusScale: number; alpha: number }> = [
    { radiusScale: 1.6, alpha: 0.55 },  // deep fog
    { radiusScale: 1.3, alpha: 0.30 },  // outer penumbra
    { radiusScale: 1.0, alpha: 0.18 },  // mid penumbra
    { radiusScale: 0.8, alpha: 0.10 },  // inner glow
    { radiusScale: 0.6, alpha: 0.06 },  // bright core edge
  ];

  /** Base darkness layer — always full screen, no cutouts. */
  private baseDarkness: Graphics;

  /** Visible ring outlines drawn at the edge of certain light sources. */
  private rings: Graphics;

  private screenWidth: number;
  private screenHeight: number;
  private _fullLight = false;

  constructor(screenWidth = 1920, screenHeight = 1080) {
    this.container = new Container();
    this.container.label = 'lighting';

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Base darkness (bottom layer, always covers everything at low alpha)
    this.baseDarkness = new Graphics();
    this.container.addChild(this.baseDarkness);

    // Gradient layers stacked on top
    for (let i = 0; i < LightingRenderer.LAYER_CONFIG.length; i++) {
      const gfx = new Graphics();
      this.layers.push(gfx);
      this.container.addChild(gfx);
    }

    // Ring outlines on top of everything
    this.rings = new Graphics();
    this.container.addChild(this.rings);

    this.rebuildDarkness();
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.rebuildDarkness();
  }

  setFullLight(enabled: boolean): void {
    this._fullLight = enabled;
    if (enabled) {
      this.baseDarkness.clear();
      this.rings.clear();
      for (const layer of this.layers) layer.clear();
      this.container.visible = false;
    } else {
      this.container.visible = true;
      this.rebuildDarkness();
    }
  }

  get fullLight(): boolean {
    return this._fullLight;
  }

  private rebuildDarkness(): void {
    if (this._fullLight) return;
    const pad = 4000;
    const w = this.screenWidth + pad * 2;
    const h = this.screenHeight + pad * 2;

    // Base layer: always full coverage
    this.baseDarkness.clear();
    this.baseDarkness.rect(-pad, -pad, w, h);
    this.baseDarkness.fill({ color: 0x000000, alpha: 0.50 });

    // Clear gradient layers
    for (const layer of this.layers) layer.clear();
  }

  updateLights(sources: LightSource[]): void {
    if (this._fullLight) return;

    const pad = 4000;
    const w = this.screenWidth + pad * 2;
    const h = this.screenHeight + pad * 2;

    // Base darkness — always full screen, no cutouts.
    this.baseDarkness.clear();
    this.baseDarkness.rect(-pad, -pad, w, h);
    this.baseDarkness.fill({ color: 0x000000, alpha: 0.50 });

    // Each gradient layer: fill rect, then cut circles at scaled radius
    const config = LightingRenderer.LAYER_CONFIG;
    for (let i = 0; i < config.length; i++) {
      const layer = this.layers[i];
      const { radiusScale, alpha } = config[i];

      layer.clear();
      layer.rect(-pad, -pad, w, h);
      layer.fill({ color: 0x000000, alpha });

      if (sources.length > 0) {
        for (const src of sources) {
          layer.circle(src.x, src.y, src.radius * radiusScale);
          layer.cut();
        }
      }
    }

    // Visible rings at light source boundaries
    this.rings.clear();
    for (const src of sources) {
      if (!src.ringColor) continue;
      // Outer glow (wider, faint)
      this.rings.circle(src.x, src.y, src.radius * 1.02);
      this.rings.stroke({ color: src.ringColor, alpha: 0.08, width: 6 });
      // Main ring
      this.rings.circle(src.x, src.y, src.radius);
      this.rings.stroke({ color: src.ringColor, alpha: 0.18, width: 2 });
      // Inner glow (tighter, faint)
      this.rings.circle(src.x, src.y, src.radius * 0.97);
      this.rings.stroke({ color: src.ringColor, alpha: 0.06, width: 4 });
    }
  }

  updateTorchLight(x: number, y: number, radius: number): void {
    this.updateLights([{ x, y, radius }]);
  }
}
