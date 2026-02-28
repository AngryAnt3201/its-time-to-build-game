import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { PlayerSnapshot, EconomySnapshot } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const tokenStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 14,
  fill: 0xd4a017, // amber
});

const healthTextStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fill: 0xcc4444, // red
});

const incomeStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x888888, // grey
});

// ── Health-bar dimensions ────────────────────────────────────────────

const BAR_WIDTH = 150;
const BAR_HEIGHT = 12;

/**
 * Heads-up display overlay showing the player's token balance,
 * health bar, and income/expenditure rates.
 *
 * Add `hud.container` to a fixed (non-camera) layer so it stays
 * anchored to the top-left corner of the viewport.
 */
export class HUD {
  readonly container: Container;

  private tokenText: Text;
  private healthText: Text;
  private incomeText: Text;

  private healthBarBg: Graphics;
  private healthBarFill: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = 'hud';

    // ── Token counter ──────────────────────────────────────────────
    this.tokenText = new Text({ text: 'tokens: 0', style: tokenStyle });
    this.tokenText.x = 12;
    this.tokenText.y = 12;
    this.container.addChild(this.tokenText);

    // ── Health bar (background + fill) ─────────────────────────────
    const barY = 34;

    this.healthBarBg = new Graphics();
    this.healthBarBg.rect(0, 0, BAR_WIDTH, BAR_HEIGHT);
    this.healthBarBg.fill(0x333333);
    this.healthBarBg.x = 12;
    this.healthBarBg.y = barY;
    this.container.addChild(this.healthBarBg);

    this.healthBarFill = new Graphics();
    this.healthBarFill.x = 12;
    this.healthBarFill.y = barY;
    this.container.addChild(this.healthBarFill);

    // ── Health text ────────────────────────────────────────────────
    this.healthText = new Text({ text: 'HP: 0/0', style: healthTextStyle });
    this.healthText.x = 12 + BAR_WIDTH + 8;
    this.healthText.y = barY;
    this.container.addChild(this.healthText);

    // ── Income / expenditure text ──────────────────────────────────
    this.incomeText = new Text({ text: '+0/s  -0/s  (0/s)', style: incomeStyle });
    this.incomeText.x = 12;
    this.incomeText.y = barY + BAR_HEIGHT + 8;
    this.container.addChild(this.incomeText);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Refresh every HUD element from the latest server snapshot.
   */
  update(player: PlayerSnapshot, economy: EconomySnapshot): void {
    // Token counter
    this.tokenText.text = `tokens: ${economy.balance}`;

    // Health bar fill
    const pct = player.max_health > 0
      ? player.health / player.max_health
      : 0;
    const fillWidth = Math.max(0, Math.min(BAR_WIDTH, Math.round(pct * BAR_WIDTH)));
    const fillColor = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xcccc44 : 0xcc4444;

    this.healthBarFill.clear();
    if (fillWidth > 0) {
      this.healthBarFill.rect(0, 0, fillWidth, BAR_HEIGHT);
      this.healthBarFill.fill(fillColor);
    }

    // Health text
    this.healthText.text = `HP: ${player.health}/${player.max_health}`;

    // Income / expenditure
    const net = economy.income_per_sec - economy.expenditure_per_sec;
    const sign = net >= 0 ? '+' : '';
    this.incomeText.text =
      `+${economy.income_per_sec}/s  -${economy.expenditure_per_sec}/s  (${sign}${net}/s)`;
  }
}
