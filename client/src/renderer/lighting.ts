import { Container, Graphics } from 'pixi.js';

/**
 * Client-side lighting renderer.
 *
 * Creates a darkness overlay across the screen and cuts out circular
 * areas for light sources (player torch, pylons, etc.).
 *
 * For the placeholder phase this uses a simple approach: a semi-transparent
 * dark rectangle with circular mask cutouts at light source positions.
 */
export class LightingRenderer {
  readonly container: Container;

  private darknessOverlay: Graphics;
  private lightMask: Graphics;
  private screenWidth: number;
  private screenHeight: number;

  constructor(screenWidth = 1920, screenHeight = 1080) {
    this.container = new Container();
    this.container.label = 'lighting';

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    // Full-screen near-black overlay
    this.darknessOverlay = new Graphics();
    this.container.addChild(this.darknessOverlay);

    // Mask that defines lit areas (cutouts from the darkness)
    this.lightMask = new Graphics();
    this.darknessOverlay.mask = this.lightMask;
    this.container.addChild(this.lightMask);

    this.rebuildDarkness();
  }

  /**
   * Rebuild the darkness overlay rectangle.
   * Call this when the screen size changes.
   */
  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.rebuildDarkness();
  }

  private rebuildDarkness(): void {
    this.darknessOverlay.clear();
    // Cover an area larger than the screen to handle camera movement.
    // The overlay follows the camera, so we use a large rectangle centered
    // at (0, 0) in the container's local space.
    const pad = 2000;
    this.darknessOverlay.rect(
      -pad,
      -pad,
      this.screenWidth + pad * 2,
      this.screenHeight + pad * 2,
    );
    this.darknessOverlay.fill({ color: 0x000000, alpha: 0.85 });
  }

  /**
   * Update torch / point light at a given world position.
   *
   * Clears any previous light cutouts and draws new ones.
   * Call this once per frame with the current set of light sources.
   *
   * @param sources - Array of { x, y, radius } in world coordinates
   */
  updateLights(sources: Array<{ x: number; y: number; radius: number }>): void {
    this.lightMask.clear();

    // The mask is inverted: we draw the full dark area, then subtract circles.
    // In PixiJS, the mask shows where to render — so we draw the dark rect
    // everywhere EXCEPT where lights are.
    //
    // Actually, for a simple approach we invert the logic:
    // - The darknessOverlay is the dark rect
    // - The lightMask defines where the darkness IS visible
    // - We want darkness everywhere EXCEPT light circles
    //
    // PixiJS mask: rendered pixel = overlay pixel WHERE mask is opaque.
    // So we draw the mask as a full rect, then we'll need a different approach.
    //
    // Simpler approach for placeholder: don't use a mask at all.
    // Instead, draw the overlay with holes by using the Graphics API.

    // Reset darkness overlay with cutouts
    this.darknessOverlay.clear();
    const pad = 2000;
    this.darknessOverlay.rect(
      -pad,
      -pad,
      this.screenWidth + pad * 2,
      this.screenHeight + pad * 2,
    );

    // Cut circles for each light source
    for (const src of sources) {
      this.darknessOverlay.circle(src.x, src.y, src.radius);
      this.darknessOverlay.cut();
    }

    this.darknessOverlay.fill({ color: 0x000000, alpha: 0.85 });
  }

  /**
   * Convenience method for a single torch light (e.g., the player's torch).
   */
  updateTorchLight(x: number, y: number, radius: number): void {
    this.updateLights([{ x, y, radius }]);
  }
}
