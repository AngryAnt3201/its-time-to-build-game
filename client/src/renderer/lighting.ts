import { Container, Graphics } from 'pixi.js';

/**
 * Simple ambient darkness overlay.
 * Draws a single full-screen dark layer to give the world a dim atmosphere.
 */
export class LightingRenderer {
  readonly container: Container;

  private baseDarkness: Graphics;
  private screenWidth: number;
  private screenHeight: number;
  private _fullLight = false;

  constructor(screenWidth = 1920, screenHeight = 1080) {
    this.container = new Container();
    this.container.label = 'lighting';

    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.baseDarkness = new Graphics();
    this.container.addChild(this.baseDarkness);

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
      this.container.visible = false;
    } else {
      this.container.visible = true;
      this.rebuildDarkness();
    }
  }

  get fullLight(): boolean {
    return this._fullLight;
  }

  rebuildDarkness(): void {
    if (this._fullLight) return;
    const pad = 4000;
    const w = this.screenWidth + pad * 2;
    const h = this.screenHeight + pad * 2;

    this.baseDarkness.clear();
    this.baseDarkness.rect(-pad, -pad, w, h);
    this.baseDarkness.fill({ color: 0x000000, alpha: 0.50 });
  }
}
