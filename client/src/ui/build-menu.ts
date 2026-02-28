import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BuildingTypeKind } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const titleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 18,
  fontWeight: 'bold',
  fill: 0xd4a017, // amber
});

const nameStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 14,
  fill: 0xd4a017, // amber
});

const costStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 12,
  fill: 0x888888, // grey
});

const descStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fontStyle: 'italic',
  fill: 0x666666, // darker grey
});

const instructionStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x555555,
});

// ── Building data ────────────────────────────────────────────────────

export interface BuildingEntry {
  type: BuildingTypeKind;
  name: string;
  cost: number;
  description: string;
  tier: number;
}

/** Tier 1 buildings available from the start. */
const TIER1_BUILDINGS: BuildingEntry[] = [
  {
    type: 'Pylon',
    name: 'Pylon',
    cost: 30,
    description: 'Illuminates surrounding area',
    tier: 0,
  },
  {
    type: 'ComputeFarm',
    name: 'Compute Farm',
    cost: 80,
    description: 'Passive token generation',
    tier: 0,
  },
  {
    type: 'TodoApp',
    name: 'Todo App',
    cost: 15,
    description: 'task: survive. status: in progress.',
    tier: 1,
  },
  {
    type: 'Calculator',
    name: 'Calculator',
    cost: 20,
    description: 'Projected income display',
    tier: 1,
  },
  {
    type: 'LandingPage',
    name: 'Landing Page',
    cost: 25,
    description: 'Agent morale boost',
    tier: 1,
  },
  {
    type: 'PortfolioSite',
    name: 'Portfolio Site',
    cost: 30,
    description: 'Early income',
    tier: 1,
  },
  {
    type: 'PomodoroTimer',
    name: 'Pomodoro Timer',
    cost: 20,
    description: 'Reduces crank heat',
    tier: 1,
  },
];

// ── Layout constants ─────────────────────────────────────────────────

const PANEL_WIDTH = 400;
const PANEL_HEIGHT = 500;
const ROW_HEIGHT = 54;
const SCROLL_PADDING = 50; // space for title + instructions
const VISIBLE_ROWS = 7;

/**
 * Build menu overlay.
 *
 * Toggle with B key. Shows available buildings grouped by tier with
 * costs and descriptions. Select a building, then click on the game
 * world to place it.
 */
export class BuildMenu {
  readonly container: Container;

  /** Whether the menu panel is currently visible. */
  visible = false;

  /** Whether we are in placement mode (building selected, waiting for click). */
  placementMode = false;

  /** The building type currently selected for placement. */
  placementBuilding: BuildingEntry | null = null;

  /** Callback when the player confirms a building placement. */
  onPlace: ((buildingType: BuildingTypeKind, x: number, y: number) => void) | null = null;

  private selectedIndex = 0;
  private scrollOffset = 0;
  private buildings: BuildingEntry[] = TIER1_BUILDINGS;

  // Panel elements
  private panel: Graphics;
  private titleText: Text;
  private instructionText: Text;
  private rowContainers: Container[] = [];

  // Ghost preview
  private ghost: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = 'build-menu';
    this.container.visible = false;

    // ── Panel background ──────────────────────────────────────────
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // ── Title ─────────────────────────────────────────────────────
    this.titleText = new Text({ text: 'BUILD', style: titleStyle });
    this.titleText.x = 16;
    this.titleText.y = 12;
    this.container.addChild(this.titleText);

    // ── Instructions at bottom ────────────────────────────────────
    this.instructionText = new Text({
      text: '[Up/Down] select   [Enter] place   [Esc/B] close',
      style: instructionStyle,
    });
    this.instructionText.x = 16;
    this.container.addChild(this.instructionText);

    // ── Ghost preview (for placement mode) ────────────────────────
    this.ghost = new Graphics();
    this.ghost.visible = false;
    // Ghost is added to the world container by main.ts, not here

    // ── Build the initial row display ─────────────────────────────
    this.rebuildRows();
    this.layoutPanel();
  }

  /** The ghost graphic, to be added to the world container by the caller. */
  get ghostGraphic(): Graphics {
    return this.ghost;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Toggle the menu open/closed. */
  toggle(): void {
    if (this.placementMode) {
      this.cancelPlacement();
      return;
    }
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.highlightSelected();
    }
  }

  /** Open the menu. */
  open(): void {
    if (this.placementMode) return;
    this.visible = true;
    this.container.visible = true;
    this.selectedIndex = 0;
    this.scrollOffset = 0;
    this.highlightSelected();
  }

  /** Close the menu and cancel any placement mode. */
  close(): void {
    this.visible = false;
    this.container.visible = false;
    this.cancelPlacement();
  }

  /** Move selection up. */
  selectPrev(): void {
    if (!this.visible) return;
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    this.highlightSelected();
  }

  /** Move selection down. */
  selectNext(): void {
    if (!this.visible) return;
    this.selectedIndex = Math.min(this.buildings.length - 1, this.selectedIndex + 1);
    if (this.selectedIndex >= this.scrollOffset + VISIBLE_ROWS) {
      this.scrollOffset = this.selectedIndex - VISIBLE_ROWS + 1;
    }
    this.highlightSelected();
  }

  /** Confirm selection and enter placement mode. */
  confirmSelection(): void {
    if (!this.visible) return;
    const building = this.buildings[this.selectedIndex];
    if (!building) return;

    this.placementBuilding = building;
    this.placementMode = true;
    this.visible = false;
    this.container.visible = false;

    // Draw the ghost outline
    this.ghost.clear();
    this.ghost.rect(-16, -16, 32, 32);
    this.ghost.stroke({ color: 0xd4a017, alpha: 0.6, width: 2 });
    this.ghost.rect(-16, -16, 32, 32);
    this.ghost.fill({ color: 0xd4a017, alpha: 0.15 });
    this.ghost.visible = true;
  }

  /** Update the ghost preview position (call from mouse move handler). */
  updateGhostPosition(worldX: number, worldY: number): void {
    if (!this.placementMode) return;
    this.ghost.x = worldX;
    this.ghost.y = worldY;
  }

  /** Confirm placement at the given world coordinates. */
  confirmPlacement(worldX: number, worldY: number): void {
    if (!this.placementMode || !this.placementBuilding) return;

    if (this.onPlace) {
      this.onPlace(this.placementBuilding.type, worldX, worldY);
    }

    this.cancelPlacement();
  }

  /** Cancel placement mode without placing. */
  cancelPlacement(): void {
    this.placementMode = false;
    this.placementBuilding = null;
    this.ghost.visible = false;
  }

  /** Returns true if the menu is blocking normal input. */
  get isBlocking(): boolean {
    return this.visible || this.placementMode;
  }

  /** Reposition the panel for the current screen size. */
  resize(screenWidth: number, screenHeight: number): void {
    this.container.x = Math.round((screenWidth - PANEL_WIDTH) / 2);
    this.container.y = Math.round((screenHeight - PANEL_HEIGHT) / 2);
  }

  // ── Private helpers ─────────────────────────────────────────────

  private layoutPanel(): void {
    this.panel.clear();
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.fill({ color: 0x1a1510, alpha: 0.9 });
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.stroke({ color: 0x3a3020, alpha: 0.8, width: 1 });

    this.instructionText.y = PANEL_HEIGHT - 24;
  }

  private rebuildRows(): void {
    // Remove old rows
    for (const row of this.rowContainers) {
      this.container.removeChild(row);
      row.destroy({ children: true });
    }
    this.rowContainers = [];

    // Create rows for each building
    for (let i = 0; i < this.buildings.length; i++) {
      const building = this.buildings[i];
      const row = new Container();
      row.label = `build-row-${i}`;

      // Row background (for highlighting)
      const bg = new Graphics();
      bg.label = 'row-bg';
      bg.rect(0, 0, PANEL_WIDTH - 16, ROW_HEIGHT - 4);
      bg.fill({ color: 0x2a2010, alpha: 0 });
      row.addChild(bg);

      // Building name
      const name = new Text({ text: building.name, style: nameStyle });
      name.x = 8;
      name.y = 4;
      row.addChild(name);

      // Cost
      const cost = new Text({ text: `${building.cost} tokens`, style: costStyle });
      cost.x = PANEL_WIDTH - 120;
      cost.y = 6;
      row.addChild(cost);

      // Description
      const desc = new Text({ text: building.description, style: descStyle });
      desc.x = 8;
      desc.y = 24;
      row.addChild(desc);

      row.x = 8;
      row.y = SCROLL_PADDING + i * ROW_HEIGHT;

      this.container.addChild(row);
      this.rowContainers.push(row);
    }

    this.highlightSelected();
  }

  private highlightSelected(): void {
    for (let i = 0; i < this.rowContainers.length; i++) {
      const row = this.rowContainers[i];
      const bg = row.getChildByLabel('row-bg') as Graphics | null;
      if (!bg) continue;

      bg.clear();
      if (i === this.selectedIndex) {
        bg.rect(0, 0, PANEL_WIDTH - 16, ROW_HEIGHT - 4);
        bg.fill({ color: 0x2a2010, alpha: 0.6 });
        bg.rect(0, 0, PANEL_WIDTH - 16, ROW_HEIGHT - 4);
        bg.stroke({ color: 0xd4a017, alpha: 0.8, width: 1 });
      } else {
        bg.rect(0, 0, PANEL_WIDTH - 16, ROW_HEIGHT - 4);
        bg.fill({ color: 0x2a2010, alpha: 0 });
      }

      // Offset row positions based on scroll
      row.y = SCROLL_PADDING + (i - this.scrollOffset) * ROW_HEIGHT;
      row.visible = i >= this.scrollOffset && i < this.scrollOffset + VISIBLE_ROWS;
    }
  }
}
