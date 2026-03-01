import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { BuildingGradeState } from '../network/protocol';

// ── Stage definitions ──────────────────────────────────────────────

interface Stage {
  name: string;
  icon: string;       // path to sprite
  threshold: number;  // cumulative stars needed to reach this stage
}

const STAGES: Stage[] = [
  { name: 'Hut',     icon: '/civilisation_progress/hut.png',     threshold: 0  },
  { name: 'Outpost', icon: '/civilisation_progress/outpost.png', threshold: 6  },
  { name: 'Village', icon: '/civilisation_progress/village.png', threshold: 14 },
  { name: 'Network', icon: '/civilisation_progress/network.png', threshold: 26 },
  { name: 'City',    icon: '/civilisation_progress/city.png',    threshold: 40 },
];

// ── Layout constants ───────────────────────────────────────────────

const ICON_SIZE = 28;
const SEGMENT_WIDTH = 72;
const SEGMENT_HEIGHT = 4;
const SEGMENT_GAP = 4;       // gap between icon and bar
const TOTAL_WIDTH = STAGES.length * ICON_SIZE + (STAGES.length - 1) * (SEGMENT_WIDTH + SEGMENT_GAP * 2);
const BAR_Y = 12;            // vertical center of bar within the component
const FONT = '"IBM Plex Mono", monospace';

const labelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x7a6a3a,
  letterSpacing: 1,
});

const starCountStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 'bold',
  fill: 0xd4a017,
  letterSpacing: 1,
});

const stageNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fontWeight: 'bold',
  fill: 0xd4a017,
  letterSpacing: 1,
});

// ── CityProgress class ─────────────────────────────────────────────

export class CityProgress {
  readonly container: Container;

  private bg: Graphics;
  private segmentBgs: Graphics[] = [];
  private segmentFills: Graphics[] = [];
  private iconSprites: (Sprite | null)[] = [];
  private iconBorders: Graphics[] = [];
  private stageLabel: Text;
  private starText: Text;
  private loaded = false;

  private prevTotalStars = -1;
  private currentStageIdx = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'city-progress';

    // ── Background panel ─────────────────────────────────────────
    this.bg = new Graphics();
    this.container.addChild(this.bg);

    // ── Build segment bars and icon placeholders ─────────────────
    let xCursor = 0;

    for (let i = 0; i < STAGES.length; i++) {
      // Icon border (drawn behind sprite)
      const border = new Graphics();
      border.x = xCursor + ICON_SIZE / 2;
      border.y = BAR_Y;
      this.iconBorders.push(border);
      this.container.addChild(border);

      // Icon placeholder (sprite loaded async)
      this.iconSprites.push(null);

      xCursor += ICON_SIZE;

      // Segment bar between icons (not after last icon)
      if (i < STAGES.length - 1) {
        xCursor += SEGMENT_GAP;

        // Bar background
        const segBg = new Graphics();
        segBg.roundRect(xCursor, BAR_Y - SEGMENT_HEIGHT / 2, SEGMENT_WIDTH, SEGMENT_HEIGHT, 2);
        segBg.fill({ color: 0x1a1510, alpha: 0.9 });
        segBg.roundRect(xCursor, BAR_Y - SEGMENT_HEIGHT / 2, SEGMENT_WIDTH, SEGMENT_HEIGHT, 2);
        segBg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });
        this.segmentBgs.push(segBg);
        this.container.addChild(segBg);

        // Bar fill (redrawn each update)
        const segFill = new Graphics();
        this.segmentFills.push(segFill);
        this.container.addChild(segFill);

        xCursor += SEGMENT_WIDTH + SEGMENT_GAP;
      }
    }

    // Draw icon borders on top of bars
    for (const border of this.iconBorders) {
      this.container.removeChild(border);
      this.container.addChild(border);
    }

    // ── Star count text (below bar) ──────────────────────────────
    this.starText = new Text({ text: '', style: starCountStyle });
    this.starText.anchor.set(0.5, 0);
    this.starText.x = TOTAL_WIDTH / 2;
    this.starText.y = BAR_Y + ICON_SIZE / 2 + 4;
    this.container.addChild(this.starText);

    // ── Stage name label (above bar) ─────────────────────────────
    this.stageLabel = new Text({ text: '', style: stageNameStyle });
    this.stageLabel.anchor.set(0.5, 1);
    this.stageLabel.x = TOTAL_WIDTH / 2;
    this.stageLabel.y = BAR_Y - ICON_SIZE / 2 - 3;
    this.container.addChild(this.stageLabel);

    // Draw background panel
    this.drawBackground();

    // Load icon sprites
    this.loadIcons();
  }

  // ── Asset loading ──────────────────────────────────────────────

  private async loadIcons(): Promise<void> {
    try {
      const textures = await Promise.all(
        STAGES.map(s => Assets.load<Texture>(s.icon)),
      );

      let xCursor = 0;
      for (let i = 0; i < STAGES.length; i++) {
        const tex = textures[i];
        tex.source.scaleMode = 'nearest';

        const sprite = new Sprite(tex);
        sprite.width = ICON_SIZE;
        sprite.height = ICON_SIZE;
        sprite.anchor.set(0.5, 0.5);
        sprite.x = xCursor + ICON_SIZE / 2;
        sprite.y = BAR_Y;
        this.iconSprites[i] = sprite;
        this.container.addChild(sprite);

        xCursor += ICON_SIZE;
        if (i < STAGES.length - 1) {
          xCursor += SEGMENT_GAP + SEGMENT_WIDTH + SEGMENT_GAP;
        }
      }

      this.loaded = true;
      // Trigger a visual refresh
      this.updateVisuals(this.prevTotalStars === -1 ? 0 : this.prevTotalStars);
    } catch (err) {
      console.warn('[city-progress] Failed to load icons:', err);
    }
  }

  // ── Drawing helpers ────────────────────────────────────────────

  private drawBackground(): void {
    const padX = 12;
    const padY = 8;
    this.bg.clear();
    this.bg.roundRect(-padX, BAR_Y - ICON_SIZE / 2 - 18, TOTAL_WIDTH + padX * 2, ICON_SIZE + 42, 4);
    this.bg.fill({ color: 0x0d0b08, alpha: 0.75 });
    this.bg.roundRect(-padX, BAR_Y - ICON_SIZE / 2 - 18, TOTAL_WIDTH + padX * 2, ICON_SIZE + 42, 4);
    this.bg.stroke({ color: 0x2a2418, alpha: 0.5, width: 1 });
  }

  private updateVisuals(totalStars: number): void {
    // Determine current stage
    let stageIdx = 0;
    for (let i = STAGES.length - 1; i >= 0; i--) {
      if (totalStars >= STAGES[i].threshold) {
        stageIdx = i;
        break;
      }
    }
    this.currentStageIdx = stageIdx;

    // Update stage name
    this.stageLabel.text = STAGES[stageIdx].name.toUpperCase();

    // Update star count
    const nextThreshold = stageIdx < STAGES.length - 1
      ? STAGES[stageIdx + 1].threshold
      : STAGES[STAGES.length - 1].threshold;
    if (totalStars >= STAGES[STAGES.length - 1].threshold) {
      this.starText.text = `\u2605 ${totalStars} STARS`;
    } else {
      this.starText.text = `\u2605 ${totalStars} / ${nextThreshold}`;
    }

    // Update segment fills
    for (let i = 0; i < STAGES.length - 1; i++) {
      const segFill = this.segmentFills[i];
      segFill.clear();

      const segStart = STAGES[i].threshold;
      const segEnd = STAGES[i + 1].threshold;
      const segRange = segEnd - segStart;

      let pct = 0;
      if (totalStars >= segEnd) {
        pct = 1;
      } else if (totalStars > segStart) {
        pct = (totalStars - segStart) / segRange;
      }

      if (pct > 0) {
        const xStart = this.getSegmentX(i);
        const fillW = Math.max(2, Math.round(pct * SEGMENT_WIDTH));
        segFill.roundRect(xStart, BAR_Y - SEGMENT_HEIGHT / 2, fillW, SEGMENT_HEIGHT, 2);
        segFill.fill(0xd4a017);
        // Highlight top edge
        segFill.rect(xStart, BAR_Y - SEGMENT_HEIGHT / 2, fillW, 1);
        segFill.fill({ color: 0xffe088, alpha: 0.4 });
      }
    }

    // Update icon borders and dimming
    let xCursor = 0;
    for (let i = 0; i < STAGES.length; i++) {
      const border = this.iconBorders[i];
      border.clear();

      const reached = totalStars >= STAGES[i].threshold;
      const isCurrent = i === stageIdx;

      // Border ring
      const radius = ICON_SIZE / 2 + 2;
      if (isCurrent) {
        // Glowing gold ring for current stage
        border.circle(0, 0, radius + 1);
        border.stroke({ color: 0xd4a017, alpha: 0.6, width: 2 });
      } else if (reached) {
        border.circle(0, 0, radius);
        border.stroke({ color: 0xd4a017, alpha: 0.3, width: 1 });
      } else {
        border.circle(0, 0, radius);
        border.stroke({ color: 0x3a3020, alpha: 0.3, width: 1 });
      }

      // Dim unreached icons
      const sprite = this.iconSprites[i];
      if (sprite) {
        sprite.alpha = reached ? 1.0 : 0.3;
      }

      xCursor += ICON_SIZE;
      if (i < STAGES.length - 1) {
        xCursor += SEGMENT_GAP + SEGMENT_WIDTH + SEGMENT_GAP;
      }
    }
  }

  /** Get the X position of a segment bar by index. */
  private getSegmentX(segIdx: number): number {
    let x = 0;
    for (let i = 0; i <= segIdx; i++) {
      x += ICON_SIZE;
      if (i <= segIdx) {
        x += SEGMENT_GAP;
      }
      if (i < segIdx) {
        x += SEGMENT_WIDTH + SEGMENT_GAP;
      }
    }
    return x;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Compute total stars and update the progress bar.
   * Call each tick from main loop.
   */
  update(
    buildingGrades: Record<string, BuildingGradeState> | undefined,
    wheelTier: string | undefined,
  ): void {
    let totalStars = 0;

    // Sum stars from graded buildings
    if (buildingGrades) {
      for (const grade of Object.values(buildingGrades)) {
        if (!grade.grading && grade.stars > 0) {
          totalStars += grade.stars;
        }
      }
    }

    // Add wheel tier stars
    if (wheelTier) {
      const wheelStars: Record<string, number> = {
        HandCrank: 1,
        GearAssembly: 2,
        WaterWheel: 3,
        RunicEngine: 4,
      };
      totalStars += wheelStars[wheelTier] ?? 0;
    }

    // Only redraw if changed
    if (totalStars !== this.prevTotalStars) {
      this.prevTotalStars = totalStars;
      this.updateVisuals(totalStars);
    }
  }

  /** Reposition to center-top on resize. */
  resize(screenWidth: number, _screenHeight: number): void {
    this.container.x = (screenWidth - TOTAL_WIDTH) / 2;
    this.container.y = 32;
  }
}
