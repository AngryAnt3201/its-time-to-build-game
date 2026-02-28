import { Container, Graphics, Text, TextStyle } from 'pixi.js';

const FONT = '"IBM Plex Mono", monospace';

export class DeathScreen {
  readonly container: Container;
  private bg: Graphics;
  private title: Text;
  private subtitle: Text;
  private timer: Text;
  private fadeAlpha = 0;
  private active = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'death-screen';
    this.container.visible = false;
    this.container.zIndex = 9999;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.title = new Text({
      text: 'SYSTEM FAILURE',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 32,
        fill: 0xff2222,
        letterSpacing: 6,
        fontWeight: 'bold',
      }),
    });
    this.title.anchor.set(0.5);
    this.container.addChild(this.title);

    this.subtitle = new Text({
      text: 'Connection terminated by hostile process',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 14,
        fill: 0x884444,
        fontStyle: 'italic',
      }),
    });
    this.subtitle.anchor.set(0.5);
    this.container.addChild(this.subtitle);

    this.timer = new Text({
      text: 'Rebooting in 10.0...',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 16,
        fill: 0x666666,
      }),
    });
    this.timer.anchor.set(0.5);
    this.container.addChild(this.timer);
  }

  show(): void {
    this.active = true;
    this.fadeAlpha = 0;
    this.container.visible = true;
  }

  hide(): void {
    this.active = false;
    this.container.visible = false;
    this.fadeAlpha = 0;
  }

  get isActive(): boolean {
    return this.active;
  }

  update(deathTimer: number, screenW: number, screenH: number): void {
    if (!this.active) return;

    this.fadeAlpha = Math.min(1, this.fadeAlpha + 0.03);

    this.bg.clear();
    this.bg.rect(0, 0, screenW, screenH);
    this.bg.fill({ color: 0x110000, alpha: this.fadeAlpha * 0.92 });

    // Red border
    this.bg.rect(0, 0, screenW, screenH);
    this.bg.stroke({ color: 0xff0000, alpha: this.fadeAlpha * 0.3, width: 4 });

    const cx = screenW / 2;
    const cy = screenH / 2;

    this.title.x = cx;
    this.title.y = cy - 40;
    this.title.alpha = this.fadeAlpha;

    // Glitch effect
    if (Math.random() < 0.15) {
      const base = 'SYSTEM FAILURE';
      let glitched = '';
      for (const ch of base) {
        glitched += Math.random() < 0.2
          ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
          : ch;
      }
      this.title.text = glitched;
    } else {
      this.title.text = 'SYSTEM FAILURE';
    }

    this.subtitle.x = cx;
    this.subtitle.y = cy;
    this.subtitle.alpha = this.fadeAlpha * 0.7;

    this.timer.x = cx;
    this.timer.y = cy + 50;
    this.timer.alpha = this.fadeAlpha;
    this.timer.text = `Rebooting in ${deathTimer.toFixed(1)}...`;
  }
}
