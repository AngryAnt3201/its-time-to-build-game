import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { PlayerSnapshot, EconomySnapshot } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';

const tokenValueStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 18,
  fontWeight: 'bold',
  fill: 0xd4a017,
  dropShadow: {
    color: 0xd4a017,
    blur: 6,
    alpha: 0.35,
    distance: 0,
  },
});

const tokenLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

const healthValueStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 14,
  fontWeight: 'bold',
  fill: 0xcc4444,
});

const incomeStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x6a6a5a,
  letterSpacing: 1,
});

const netPositiveStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 'bold',
  fill: 0x5a9a4a,
  letterSpacing: 1,
});

const netNegativeStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 'bold',
  fill: 0xcc4444,
  letterSpacing: 1,
});

// ── Health bar config ────────────────────────────────────────────────

const BAR_WIDTH = 140;
const BAR_HEIGHT = 10;
const BAR_SEGMENTS = 10; // number of tally-mark segments
const SEGMENT_GAP = 2;

// ── Corner bracket helper ────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
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

// ── HUD class ────────────────────────────────────────────────────────

export class HUD {
  readonly container: Container;

  private tokenIcon: Sprite | null = null;
  private healthIcon: Sprite | null = null;
  private tokenValueText: Text;
  private tokenLabelText: Text;
  private healthValueText: Text;
  private incomeText: Text;
  private netText: Text;

  private healthBarBg: Graphics;
  private healthBarFill: Graphics;
  private healthBarSegments: Graphics;
  private frameBrackets: Graphics;
  private panelBg: Graphics;

  private prevTokens = -1;
  private tokenPulseTimer = 0;

  private loaded = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'hud';

    // ── Panel background ──────────────────────────────────────────
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // ── Corner brackets ───────────────────────────────────────────
    this.frameBrackets = new Graphics();
    this.container.addChild(this.frameBrackets);

    // ── Token section ─────────────────────────────────────────────
    this.tokenLabelText = new Text({ text: 'TOKENS', style: tokenLabelStyle });
    this.tokenLabelText.x = 44;
    this.tokenLabelText.y = 14;
    this.container.addChild(this.tokenLabelText);

    this.tokenValueText = new Text({ text: '0', style: tokenValueStyle });
    this.tokenValueText.x = 44;
    this.tokenValueText.y = 26;
    this.container.addChild(this.tokenValueText);

    // ── Income / Net line ─────────────────────────────────────────
    this.incomeText = new Text({ text: '+0/s', style: incomeStyle });
    this.incomeText.x = 44;
    this.incomeText.y = 50;
    this.container.addChild(this.incomeText);

    this.netText = new Text({ text: 'net +0/s', style: netPositiveStyle });
    this.netText.x = 110;
    this.netText.y = 50;
    this.container.addChild(this.netText);

    // ── Divider ───────────────────────────────────────────────────
    const divider = new Graphics();
    divider.moveTo(16, 68);
    divider.lineTo(200, 68);
    divider.stroke({ color: 0x3a3020, alpha: 0.5, width: 1 });
    this.container.addChild(divider);

    // ── Health section ────────────────────────────────────────────
    this.healthValueText = new Text({ text: '0 / 0', style: healthValueStyle });
    this.healthValueText.x = 44;
    this.healthValueText.y = 76;
    this.container.addChild(this.healthValueText);

    // Health bar background
    this.healthBarBg = new Graphics();
    this.healthBarBg.x = 44;
    this.healthBarBg.y = 98;
    this.container.addChild(this.healthBarBg);

    // Health bar fill
    this.healthBarFill = new Graphics();
    this.healthBarFill.x = 44;
    this.healthBarFill.y = 98;
    this.container.addChild(this.healthBarFill);

    // Health bar segment lines (tally marks)
    this.healthBarSegments = new Graphics();
    this.healthBarSegments.x = 44;
    this.healthBarSegments.y = 98;
    this.container.addChild(this.healthBarSegments);

    // Draw static elements
    this.drawPanel();
    this.drawHealthBarBg();
    this.drawSegmentLines();

    // Load icon assets
    this.loadIcons();
  }

  // ── Asset loading ───────────────────────────────────────────────

  private async loadIcons(): Promise<void> {
    try {
      const [tokenTex, healthTex] = await Promise.all([
        Assets.load<Texture>('/icons/hud/token_symbol.png'),
        Assets.load<Texture>('/icons/hud/health_symbol.png'),
      ]);

      tokenTex.source.scaleMode = 'nearest';
      healthTex.source.scaleMode = 'nearest';

      // Token icon
      this.tokenIcon = new Sprite(tokenTex);
      this.tokenIcon.width = 24;
      this.tokenIcon.height = 24;
      this.tokenIcon.x = 14;
      this.tokenIcon.y = 22;
      this.container.addChild(this.tokenIcon);

      // Health icon
      this.healthIcon = new Sprite(healthTex);
      this.healthIcon.width = 20;
      this.healthIcon.height = 20;
      this.healthIcon.x = 16;
      this.healthIcon.y = 76;
      this.container.addChild(this.healthIcon);

      this.loaded = true;
    } catch (err) {
      console.warn('[hud] Failed to load icons:', err);
    }
  }

  // ── Drawing helpers ─────────────────────────────────────────────

  private drawPanel(): void {
    const panelW = 220;
    const panelH = 118;

    this.panelBg.clear();
    this.panelBg.roundRect(6, 6, panelW, panelH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.82 });
    this.panelBg.roundRect(6, 6, panelW, panelH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.6, width: 1 });

    this.frameBrackets.clear();
    drawCornerBrackets(this.frameBrackets, 6, 6, panelW, panelH, 10, 0xd4a017, 0.4);
  }

  private drawHealthBarBg(): void {
    this.healthBarBg.clear();
    this.healthBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.healthBarBg.fill({ color: 0x1a1210, alpha: 0.9 });
    this.healthBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.healthBarBg.stroke({ color: 0x3a2a1a, alpha: 0.6, width: 1 });
  }

  private drawSegmentLines(): void {
    this.healthBarSegments.clear();
    const segW = BAR_WIDTH / BAR_SEGMENTS;
    for (let i = 1; i < BAR_SEGMENTS; i++) {
      const sx = Math.round(i * segW);
      this.healthBarSegments.moveTo(sx, 0);
      this.healthBarSegments.lineTo(sx, BAR_HEIGHT);
      this.healthBarSegments.stroke({ color: 0x0d0b08, alpha: 0.7, width: 1 });
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  update(player: PlayerSnapshot, economy: EconomySnapshot): void {
    // ── Token pulse on change ─────────────────────────────────────
    if (economy.balance !== this.prevTokens && this.prevTokens !== -1) {
      this.tokenPulseTimer = 12;
    }
    this.prevTokens = economy.balance;

    if (this.tokenPulseTimer > 0) {
      this.tokenPulseTimer--;
      const pulseScale = 1 + Math.sin(this.tokenPulseTimer * 0.5) * 0.06;
      this.tokenValueText.scale.set(pulseScale);
      if (this.tokenIcon) {
        this.tokenIcon.scale.set(pulseScale * (24 / this.tokenIcon.texture.width));
      }
    } else {
      this.tokenValueText.scale.set(1);
      if (this.tokenIcon && this.loaded) {
        this.tokenIcon.width = 24;
        this.tokenIcon.height = 24;
      }
    }

    // ── Token value ───────────────────────────────────────────────
    this.tokenValueText.text = economy.balance.toLocaleString();

    // ── Income / net ──────────────────────────────────────────────
    this.incomeText.text = `+${economy.income_per_sec}/s`;
    const net = Math.round(economy.income_per_sec - economy.expenditure_per_sec);
    const sign = net >= 0 ? '+' : '';
    this.netText.text = `net ${sign}${net}/s`;
    this.netText.style = net >= 0 ? netPositiveStyle : netNegativeStyle;

    // ── Health bar fill ───────────────────────────────────────────
    const pct = player.max_health > 0
      ? player.health / player.max_health
      : 0;
    const fillWidth = Math.max(0, Math.min(BAR_WIDTH, Math.round(pct * BAR_WIDTH)));

    // Color shifts: green > yellow > red
    let fillColor: number;
    if (pct > 0.6) fillColor = 0x3a8a3a;
    else if (pct > 0.3) fillColor = 0x9a8a2a;
    else fillColor = 0xaa2a2a;

    this.healthBarFill.clear();
    if (fillWidth > 0) {
      this.healthBarFill.rect(0, 0, fillWidth, BAR_HEIGHT);
      this.healthBarFill.fill(fillColor);

      // Subtle lighter top edge for depth
      this.healthBarFill.rect(0, 0, fillWidth, 2);
      this.healthBarFill.fill({ color: 0xffffff, alpha: 0.08 });
    }

    // ── Health text ───────────────────────────────────────────────
    this.healthValueText.text = `${player.health} / ${player.max_health}`;
  }
}
