import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { LogEntry, LogCategory } from '../network/protocol';

// ── Constants ────────────────────────────────────────────────────────

const FEED_WIDTH = 300;
const PADDING = 10;
const MAX_LINES = 20;

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const lineStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0xaaaaaa,
  wordWrap: true,
  wordWrapWidth: 280,
});

/** Map LogCategory to a short prefix tag. */
const CATEGORY_PREFIX: Record<LogCategory, string> = {
  System: '[sys]',
  Agent: '[agt]',
  Combat: '[cmb]',
  Economy: '[eco]',
  Exploration: '[exp]',
  Building: '[bld]',
};

/**
 * Scrolling, parchment-style log feed positioned at the right side
 * of the screen.
 *
 * Add `logFeed.container` to a fixed UI layer. Call `resize()` after
 * the application viewport changes so the background stays correct.
 */
export class LogFeed {
  readonly container: Container;

  private bg: Graphics;
  private lines: string[] = [];
  private lineTexts: Text[] = [];
  private screenWidth: number;
  private screenHeight: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.container = new Container();
    this.container.label = 'log-feed';

    // ── Parchment background ───────────────────────────────────────
    this.bg = new Graphics();
    this.drawBackground();
    this.container.addChild(this.bg);

    // Position the container at the right edge of the screen
    this.container.x = this.screenWidth - FEED_WIDTH - 10;
    this.container.y = 20;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Append new log entries from the server, trim to `MAX_LINES`,
   * and re-render the visible text.
   */
  addEntries(entries: LogEntry[]): void {
    for (const entry of entries) {
      const prefix = CATEGORY_PREFIX[entry.category] ?? '[???]';
      this.lines.push(`${prefix} ${entry.text}`);
    }

    // Trim oldest lines if over the cap
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(this.lines.length - MAX_LINES);
    }

    this.render();
  }

  /**
   * Call when the viewport is resized so the feed repositions and
   * redraws its background.
   */
  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.drawBackground();
    this.container.x = this.screenWidth - FEED_WIDTH - 10;
    this.container.y = 20;
    this.render();
  }

  // ── Internals ────────────────────────────────────────────────────

  /** Draw (or redraw) the parchment background panel. */
  private drawBackground(): void {
    const panelHeight = this.screenHeight - 40;

    this.bg.clear();
    // Dark-brown fill at 85 % alpha
    this.bg.rect(0, 0, FEED_WIDTH, panelHeight);
    this.bg.fill({ color: 0x1a1510, alpha: 0.85 });
    // Thin border
    this.bg.rect(0, 0, FEED_WIDTH, panelHeight);
    this.bg.stroke({ color: 0x3a3020, width: 1 });
  }

  /** Remove existing Text objects and re-create them from `this.lines`. */
  private render(): void {
    // Destroy previous text objects
    for (const t of this.lineTexts) {
      this.container.removeChild(t);
      t.destroy();
    }
    this.lineTexts = [];

    let yOffset = PADDING;

    for (const line of this.lines) {
      const t = new Text({ text: line, style: lineStyle });
      t.x = PADDING;
      t.y = yOffset;
      this.container.addChild(t);
      this.lineTexts.push(t);

      // Advance by the measured height so wrapped lines don't overlap
      yOffset += t.height + 2;
    }
  }
}
