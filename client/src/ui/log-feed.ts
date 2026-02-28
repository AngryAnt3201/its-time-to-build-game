import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { LogEntry, LogCategory } from '../network/protocol';

// ── Constants ────────────────────────────────────────────────────────

const FEED_WIDTH = 300;
const PADDING = 10;
const MAX_LINES = 20;
const HEIGHT_RATIO = 0.66;

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const lineStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0xaaaaaa,
  wordWrap: true,
  wordWrapWidth: 280,
});

const labelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
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

// ── Corner bracket helper ────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics,
  x: number, y: number,
  w: number, h: number,
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
  private brackets: Graphics;
  private labelText: Text;
  private contentMask: Graphics;
  private contentContainer: Container;
  private lines: string[] = [];
  private lineTexts: Text[] = [];
  private screenWidth: number;
  private screenHeight: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;

    this.container = new Container();
    this.container.label = 'log-feed';

    // ── Panel background ────────────────────────────────────────────
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    // ── Corner brackets ─────────────────────────────────────────────
    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // ── Label ───────────────────────────────────────────────────────
    this.labelText = new Text({ text: 'LOG', style: labelStyle });
    this.labelText.x = 10;
    this.labelText.y = 6;
    this.container.addChild(this.labelText);

    // ── Scrollable content area ─────────────────────────────────────
    this.contentContainer = new Container();
    this.contentContainer.x = 0;
    this.contentContainer.y = 22;
    this.container.addChild(this.contentContainer);

    // ── Mask to clip content ────────────────────────────────────────
    this.contentMask = new Graphics();
    this.container.addChild(this.contentMask);
    this.contentContainer.mask = this.contentMask;

    this.drawPanel();

    // Position the container at the right edge of the screen
    this.container.x = this.screenWidth - FEED_WIDTH - 16;
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

    this.drawPanel();
    this.container.x = this.screenWidth - FEED_WIDTH - 16;
    this.container.y = 20;
    this.render();
  }

  // ── Internals ────────────────────────────────────────────────────

  /** Draw (or redraw) the panel background matching inventory/agents style. */
  private drawPanel(): void {
    const panelHeight = Math.floor(this.screenHeight * HEIGHT_RATIO);

    this.bg.clear();
    this.bg.roundRect(0, 0, FEED_WIDTH, panelHeight, 3);
    this.bg.fill({ color: 0x0d0b08, alpha: 0.72 });
    this.bg.roundRect(0, 0, FEED_WIDTH, panelHeight, 3);
    this.bg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });

    this.brackets.clear();
    drawCornerBrackets(this.brackets, 0, 0, FEED_WIDTH, panelHeight, 8, 0xd4a017, 0.25);

    // Update content mask to clip within panel
    this.contentMask.clear();
    this.contentMask.rect(PADDING, 22, FEED_WIDTH - PADDING * 2, panelHeight - 30);
    this.contentMask.fill({ color: 0xffffff });
  }

  /** Remove existing Text objects and re-create them from `this.lines`. */
  private render(): void {
    const panelHeight = Math.floor(this.screenHeight * HEIGHT_RATIO);
    const maxContentHeight = panelHeight - 30;

    // Destroy previous text objects
    for (const t of this.lineTexts) {
      this.contentContainer.removeChild(t);
      t.destroy();
    }
    this.lineTexts = [];

    let yOffset = 0;

    for (const line of this.lines) {
      const t = new Text({ text: line, style: lineStyle });
      t.x = PADDING;
      t.y = yOffset;
      this.contentContainer.addChild(t);
      this.lineTexts.push(t);

      // Advance by the measured height so wrapped lines don't overlap
      yOffset += t.height + 2;
    }

    // Auto-scroll: if content overflows, shift up so newest lines are visible
    if (yOffset > maxContentHeight) {
      this.contentContainer.y = 22 - (yOffset - maxContentHeight);
    } else {
      this.contentContainer.y = 22;
    }
  }
}
