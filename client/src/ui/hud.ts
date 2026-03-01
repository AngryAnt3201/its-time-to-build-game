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

  // Economy tooltip
  private tooltipEl: HTMLDivElement;
  private lastEconomy: EconomySnapshot | null = null;
  private tooltipVisible = false;

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

    // ── Economy tooltip (HTML overlay) ───────────────────────────
    this.tooltipEl = document.createElement('div');
    this.tooltipEl.id = 'economy-tooltip';
    this.tooltipEl.style.cssText = `
      display: none;
      position: fixed;
      z-index: 999;
      background: #1a1510;
      border: 1px solid #d4a017;
      border-radius: 4px;
      padding: 10px 14px;
      font-family: 'IBM Plex Mono', monospace;
      pointer-events: none;
      min-width: 200px;
      max-width: 300px;
      box-shadow: 0 0 12px rgba(212, 160, 23, 0.2);
      font-size: 11px;
      line-height: 1.5;
    `;
    document.body.appendChild(this.tooltipEl);

    // Hover detection: token area is roughly the top part of the HUD panel
    const PANEL_X = 6, PANEL_Y = 6, PANEL_W = 220, TOKEN_SECTION_H = 62;
    document.addEventListener('mousemove', (e: MouseEvent) => {
      const mx = e.clientX;
      const my = e.clientY;
      const over = mx >= PANEL_X && mx <= PANEL_X + PANEL_W
                && my >= PANEL_Y && my <= PANEL_Y + TOKEN_SECTION_H;
      if (over && this.lastEconomy) {
        this.showTooltip(PANEL_X + PANEL_W + 8, PANEL_Y);
      } else if (!over && this.tooltipVisible) {
        this.hideTooltip();
      }
    });
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

  // ── Tooltip helpers ─────────────────────────────────────────────

  private showTooltip(x: number, y: number): void {
    const eco = this.lastEconomy;
    if (!eco) return;

    // Aggregate income sources by name
    const incomeMap = new Map<string, { total: number; count: number }>();
    for (const [name, val] of eco.income_sources) {
      const entry = incomeMap.get(name);
      if (entry) { entry.total += val; entry.count++; }
      else incomeMap.set(name, { total: val, count: 1 });
    }

    // Aggregate expenditure sinks by name
    const expMap = new Map<string, { total: number; count: number }>();
    for (const [name, val] of eco.expenditure_sinks) {
      const entry = expMap.get(name);
      if (entry) { entry.total += val; entry.count++; }
      else expMap.set(name, { total: val, count: 1 });
    }

    const fmt = (v: number) => v % 1 === 0 ? v.toString() : v.toFixed(1);

    let html = '';

    // Income section
    html += `<div style="color:#d4a017;font-weight:bold;margin-bottom:4px;">GENERATION</div>`;
    if (incomeMap.size === 0) {
      html += `<div style="color:#5a5a4a;font-style:italic;">No income sources</div>`;
    } else {
      for (const [name, { total, count }] of incomeMap) {
        const label = count > 1 ? `${name} x${count}` : name;
        html += `<div style="display:flex;justify-content:space-between;">`;
        html += `<span style="color:#9a9a7a;">${label}</span>`;
        html += `<span style="color:#5a9a4a;">+${fmt(total)}/s</span>`;
        html += `</div>`;
      }
      html += `<div style="display:flex;justify-content:space-between;border-top:1px solid #2a2418;margin-top:4px;padding-top:4px;">`;
      html += `<span style="color:#8a8a6a;">Total</span>`;
      html += `<span style="color:#5a9a4a;font-weight:bold;">+${fmt(eco.income_per_sec)}/s</span>`;
      html += `</div>`;
    }

    // Expenditure section
    html += `<div style="color:#cc6644;font-weight:bold;margin-top:8px;margin-bottom:4px;">AGENT WAGES</div>`;
    if (expMap.size === 0) {
      html += `<div style="color:#5a5a4a;font-style:italic;">No agents employed</div>`;
    } else {
      for (const [name, { total, count }] of expMap) {
        const label = count > 1 ? `${name} x${count}` : name;
        html += `<div style="display:flex;justify-content:space-between;">`;
        html += `<span style="color:#9a9a7a;">${label}</span>`;
        html += `<span style="color:#cc4444;">-${fmt(total)}/s</span>`;
        html += `</div>`;
      }
      html += `<div style="display:flex;justify-content:space-between;border-top:1px solid #2a2418;margin-top:4px;padding-top:4px;">`;
      html += `<span style="color:#8a8a6a;">Total</span>`;
      html += `<span style="color:#cc4444;font-weight:bold;">-${fmt(eco.expenditure_per_sec)}/s</span>`;
      html += `</div>`;
    }

    // Net
    const net = eco.income_per_sec - eco.expenditure_per_sec;
    const netSign = net >= 0 ? '+' : '';
    const netColor = net >= 0 ? '#5a9a4a' : '#cc4444';
    html += `<div style="display:flex;justify-content:space-between;border-top:1px solid #d4a017;margin-top:8px;padding-top:6px;">`;
    html += `<span style="color:#d4a017;font-weight:bold;">NET</span>`;
    html += `<span style="color:${netColor};font-weight:bold;">${netSign}${fmt(net)}/s</span>`;
    html += `</div>`;

    this.tooltipEl.innerHTML = html;
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;
    this.tooltipVisible = true;
  }

  private hideTooltip(): void {
    this.tooltipEl.style.display = 'none';
    this.tooltipVisible = false;
  }

  // ── Public API ───────────────────────────────────────────────────

  update(player: PlayerSnapshot, economy: EconomySnapshot): void {
    this.lastEconomy = economy;
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
    const incomeFmt = economy.income_per_sec % 1 === 0
      ? economy.income_per_sec.toString()
      : economy.income_per_sec.toFixed(1);
    this.incomeText.text = `+${incomeFmt}/s`;
    const net = economy.income_per_sec - economy.expenditure_per_sec;
    const sign = net >= 0 ? '+' : '';
    const netFmt = net % 1 === 0 ? net.toString() : net.toFixed(1);
    this.netText.text = `net ${sign}${netFmt}/s`;
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
