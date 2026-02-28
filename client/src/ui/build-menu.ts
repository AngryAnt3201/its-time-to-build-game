import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BuildingTypeKind } from '../network/protocol';
import {
  getBuildingsForPage,
  getPageTitle,
  TOTAL_PAGES,
  buildingTypeToId,
  type BuildingDef,
} from '../data/buildings';

// ── Re-export for compatibility with hotbar ─────────────────────────

export interface BuildingEntry {
  type: BuildingTypeKind;
  name: string;
  cost: number;
  description: string;
  tier: number;
}

// ── Style constants ─────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const titleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 16,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const pageNavStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 14,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const pageTitleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fontWeight: 'bold',
  fill: 0xc89b15,
});

const cardNameStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0xd4a017,
  align: 'center',
  wordWrap: true,
  wordWrapWidth: 100,
});

const cardCostStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 9,
  fill: 0x6a6a5a,
  align: 'center',
});

const cardLockedNameStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x555555,
  align: 'center',
  wordWrap: true,
  wordWrapWidth: 100,
});

const cardLockedCostStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 9,
  fill: 0x444444,
  align: 'center',
});

const cardLockedLabelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 8,
  fill: 0x8b4444,
  align: 'center',
});

const footerStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x555555,
});

// ── Layout constants ────────────────────────────────────────────────

const PANEL_WIDTH = 520;
const PANEL_HEIGHT = 420;
const CARD_W = 110;
const CARD_H = 88;
const CARD_GAP = 8;
const COLS = 4;
const ICON_SIZE = 24;

const HEADER_HEIGHT = 40;
const FOOTER_HEIGHT = 30;
const GRID_LEFT = 16;
const GRID_TOP = HEADER_HEIGHT + 8;

/**
 * Paginated grid-based building browser.
 *
 * Toggle with B key. Shows all buildings organized by tier across 4 pages.
 * Navigate with arrow keys, confirm with Enter, close with Esc/B.
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
  private currentPage = 1;
  private unlockedBuildings: Set<string> = new Set();

  // Panel elements
  private panel: Graphics;
  private titleText: Text;
  private pageNavLeft: Text;
  private pageNavRight: Text;
  private pageTitleText: Text;
  private footerText: Text;
  private cardContainers: Container[] = [];
  private gridContainer: Container;

  // Ghost preview
  private ghost: Graphics;

  constructor() {
    this.container = new Container();
    this.container.label = 'build-menu';
    this.container.visible = false;

    // ── Panel background ────────────────────────────────────────
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // ── Title (top-left) ────────────────────────────────────────
    this.titleText = new Text({ text: 'BUILD', style: titleStyle });
    this.titleText.x = 16;
    this.titleText.y = 10;
    this.container.addChild(this.titleText);

    // ── Page navigation arrows + tier title (header center/right) ──
    this.pageNavLeft = new Text({ text: '\u25C4', style: pageNavStyle });
    this.pageNavLeft.y = 11;
    this.container.addChild(this.pageNavLeft);

    this.pageTitleText = new Text({ text: '', style: pageTitleStyle });
    this.pageTitleText.y = 12;
    this.container.addChild(this.pageTitleText);

    this.pageNavRight = new Text({ text: '\u25BA', style: pageNavStyle });
    this.pageNavRight.y = 11;
    this.container.addChild(this.pageNavRight);

    // ── Grid container ──────────────────────────────────────────
    this.gridContainer = new Container();
    this.gridContainer.x = GRID_LEFT;
    this.gridContainer.y = GRID_TOP;
    this.container.addChild(this.gridContainer);

    // ── Footer ──────────────────────────────────────────────────
    this.footerText = new Text({ text: '', style: footerStyle });
    this.footerText.x = 16;
    this.container.addChild(this.footerText);

    // ── Ghost preview (for placement mode) ──────────────────────
    this.ghost = new Graphics();
    this.ghost.visible = false;

    // ── Build the initial display ───────────────────────────────
    this.drawPanel();
    this.rebuildPage();
  }

  /** The ghost graphic, to be added to the world container by the caller. */
  get ghostGraphic(): Graphics {
    return this.ghost;
  }

  /** Returns true if the menu is blocking normal input. */
  get isBlocking(): boolean {
    return this.visible || this.placementMode;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Update which buildings are unlocked (called when server sends state). */
  setUnlockedBuildings(ids: string[]): void {
    this.unlockedBuildings = new Set(ids);
    this.rebuildPage();
  }

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
      this.currentPage = 1;
      this.rebuildPage();
    }
  }

  /** Open the menu. */
  open(): void {
    if (this.placementMode) return;
    this.visible = true;
    this.container.visible = true;
    this.selectedIndex = 0;
    this.currentPage = 1;
    this.rebuildPage();
  }

  /** Close the menu and cancel any placement mode. */
  close(): void {
    this.visible = false;
    this.container.visible = false;
    this.cancelPlacement();
  }

  /** Move selection up by one row (COLS items). */
  selectPrev(): void {
    if (!this.visible) return;
    const buildings = getBuildingsForPage(this.currentPage);
    if (buildings.length === 0) return;

    const newIndex = this.selectedIndex - COLS;
    if (newIndex >= 0) {
      this.selectedIndex = newIndex;
      this.highlightSelected();
    }
  }

  /** Move selection down by one row (COLS items). */
  selectNext(): void {
    if (!this.visible) return;
    const buildings = getBuildingsForPage(this.currentPage);
    if (buildings.length === 0) return;

    const newIndex = this.selectedIndex + COLS;
    if (newIndex < buildings.length) {
      this.selectedIndex = newIndex;
      this.highlightSelected();
    }
  }

  /** Move selection left by one. If at left edge, go to previous page. */
  selectLeft(): void {
    if (!this.visible) return;
    const col = this.selectedIndex % COLS;
    if (col === 0) {
      // At left edge — go to previous page, select last item
      if (this.currentPage > 1) {
        this.currentPage--;
        const buildings = getBuildingsForPage(this.currentPage);
        this.selectedIndex = Math.max(0, buildings.length - 1);
        this.rebuildPage();
      }
    } else {
      this.selectedIndex--;
      this.highlightSelected();
    }
  }

  /** Move selection right by one. If at right edge, go to next page. */
  selectRight(): void {
    if (!this.visible) return;
    const buildings = getBuildingsForPage(this.currentPage);
    if (buildings.length === 0) return;

    const col = this.selectedIndex % COLS;
    const isLastOnRow = col === COLS - 1;
    const isLastItem = this.selectedIndex === buildings.length - 1;

    if (isLastOnRow || isLastItem) {
      // At right edge — go to next page, select first item
      if (this.currentPage < TOTAL_PAGES) {
        this.currentPage++;
        this.selectedIndex = 0;
        this.rebuildPage();
      }
    } else {
      this.selectedIndex++;
      this.highlightSelected();
    }
  }

  /** Go to the next tier page. */
  nextPage(): void {
    if (!this.visible) return;
    if (this.currentPage < TOTAL_PAGES) {
      this.currentPage++;
      this.selectedIndex = 0;
      this.rebuildPage();
    }
  }

  /** Go to the previous tier page. */
  prevPage(): void {
    if (!this.visible) return;
    if (this.currentPage > 1) {
      this.currentPage--;
      this.selectedIndex = 0;
      this.rebuildPage();
    }
  }

  /** Confirm selection and enter placement mode. */
  confirmSelection(): void {
    if (!this.visible) return;
    const buildings = getBuildingsForPage(this.currentPage);
    const building = buildings[this.selectedIndex];
    if (!building) return;

    // Prevent placement of locked buildings
    const buildingId = buildingTypeToId(building.type);
    if (this.unlockedBuildings.size > 0 && !this.unlockedBuildings.has(buildingId)) {
      return;
    }

    this.placementBuilding = {
      type: building.type,
      name: building.name,
      cost: building.cost,
      description: building.description,
      tier: building.tier,
    };
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

  /** Reposition the panel for the current screen size. */
  resize(screenWidth: number, screenHeight: number): void {
    this.container.x = Math.round((screenWidth - PANEL_WIDTH) / 2);
    this.container.y = Math.round((screenHeight - PANEL_HEIGHT) / 2);
  }

  // ── Private helpers ───────────────────────────────────────────────

  private drawPanel(): void {
    this.panel.clear();
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.fill({ color: 0x1a1510, alpha: 0.95 });
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.stroke({ color: 0x3a3020, alpha: 0.8, width: 1 });

    this.footerText.y = PANEL_HEIGHT - FOOTER_HEIGHT + 4;
  }

  private rebuildPage(): void {
    // Remove old cards
    for (const card of this.cardContainers) {
      this.gridContainer.removeChild(card);
      card.destroy({ children: true });
    }
    this.cardContainers = [];

    const buildings = getBuildingsForPage(this.currentPage);

    // Update header: page title and nav arrows
    const pageTitle = getPageTitle(this.currentPage);
    this.pageTitleText.text = pageTitle;

    // Position nav elements centered in the right portion of the header
    const navCenterX = PANEL_WIDTH / 2 + 60;
    this.pageTitleText.x = navCenterX - this.pageTitleText.width / 2;
    this.pageNavLeft.x = this.pageTitleText.x - 24;
    this.pageNavRight.x = this.pageTitleText.x + this.pageTitleText.width + 10;

    // Dim arrows at bounds
    this.pageNavLeft.alpha = this.currentPage > 1 ? 1.0 : 0.3;
    this.pageNavRight.alpha = this.currentPage < TOTAL_PAGES ? 1.0 : 0.3;

    // Update footer
    this.footerText.text = `[\u2191\u2193\u2190\u2192] navigate  [Enter] build  [Esc] close  Page ${this.currentPage}/${TOTAL_PAGES}`;

    // Clamp selected index
    if (this.selectedIndex >= buildings.length) {
      this.selectedIndex = Math.max(0, buildings.length - 1);
    }

    // Create cards
    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      const col = i % COLS;
      const row = Math.floor(i / COLS);

      const card = this.createCard(building, i);
      card.x = col * (CARD_W + CARD_GAP);
      card.y = row * (CARD_H + CARD_GAP);
      this.gridContainer.addChild(card);
      this.cardContainers.push(card);
    }

    this.highlightSelected();
  }

  private createCard(building: BuildingDef, index: number): Container {
    const card = new Container();
    card.label = `card-${index}`;

    const buildingId = buildingTypeToId(building.type);
    const isLocked =
      this.unlockedBuildings.size > 0 && !this.unlockedBuildings.has(buildingId);

    // Card background
    const bg = new Graphics();
    bg.label = 'card-bg';
    bg.roundRect(0, 0, CARD_W, CARD_H, 3);
    bg.fill({ color: 0x141210, alpha: 1 });
    bg.roundRect(0, 0, CARD_W, CARD_H, 3);
    bg.stroke({ color: 0x2a2418, alpha: 1, width: 1 });
    card.addChild(bg);

    // Icon placeholder (dashed border box)
    const iconPlaceholder = new Graphics();
    const iconX = Math.round((CARD_W - ICON_SIZE) / 2);
    const iconY = 6;
    iconPlaceholder.roundRect(iconX, iconY, ICON_SIZE, ICON_SIZE, 2);
    iconPlaceholder.stroke({ color: isLocked ? 0x333333 : 0x3a3020, alpha: 0.5, width: 1 });
    card.addChild(iconPlaceholder);

    if (isLocked) {
      // Locked: show "????" and [LOCKED]
      const hiddenText = new Text({
        text: '????',
        style: cardLockedNameStyle,
      });
      hiddenText.anchor.set(0.5, 0);
      hiddenText.x = CARD_W / 2;
      hiddenText.y = 34;
      card.addChild(hiddenText);

      const lockedText = new Text({
        text: '[LOCKED]',
        style: cardLockedLabelStyle,
      });
      lockedText.anchor.set(0.5, 0);
      lockedText.x = CARD_W / 2;
      lockedText.y = 52;
      card.addChild(lockedText);
    } else {
      // Unlocked: show name + cost
      const nameText = new Text({
        text: building.name,
        style: cardNameStyle,
      });
      nameText.anchor.set(0.5, 0);
      nameText.x = CARD_W / 2;
      nameText.y = 34;
      card.addChild(nameText);

      const costText = new Text({
        text: `${building.cost}\u25C6`,
        style: cardCostStyle,
      });
      costText.anchor.set(0.5, 0);
      costText.x = CARD_W / 2;
      costText.y = 56;
      card.addChild(costText);
    }

    return card;
  }

  private isBuildingLocked(pageIndex: number): boolean {
    const buildings = getBuildingsForPage(this.currentPage);
    if (this.unlockedBuildings.size === 0) return false;
    const building = buildings[pageIndex];
    if (!building) return false;
    return !this.unlockedBuildings.has(buildingTypeToId(building.type));
  }

  private highlightSelected(): void {
    for (let i = 0; i < this.cardContainers.length; i++) {
      const card = this.cardContainers[i];
      const bg = card.getChildByLabel('card-bg') as Graphics | null;
      if (!bg) continue;

      bg.clear();

      if (i === this.selectedIndex) {
        const locked = this.isBuildingLocked(i);
        // Selected card: bright border, slightly brighter fill
        bg.roundRect(0, 0, CARD_W, CARD_H, 3);
        bg.fill({ color: locked ? 0x1a1210 : 0x1e1a14, alpha: 1 });
        bg.roundRect(0, 0, CARD_W, CARD_H, 3);
        bg.stroke({
          color: locked ? 0x552222 : 0xd4a017,
          alpha: 1,
          width: 2,
        });

        // Corner brackets on selected card
        this.drawCornerBrackets(bg, locked);
      } else {
        bg.roundRect(0, 0, CARD_W, CARD_H, 3);
        bg.fill({ color: 0x141210, alpha: 1 });
        bg.roundRect(0, 0, CARD_W, CARD_H, 3);
        bg.stroke({ color: 0x2a2418, alpha: 1, width: 1 });
      }
    }
  }

  private drawCornerBrackets(g: Graphics, locked: boolean): void {
    const color = locked ? 0x552222 : 0xd4a017;
    const len = 6;
    const inset = -2;
    const w = CARD_W;
    const h = CARD_H;

    // Top-left
    g.moveTo(inset, inset + len);
    g.lineTo(inset, inset);
    g.lineTo(inset + len, inset);
    g.stroke({ color, alpha: 0.8, width: 1 });

    // Top-right
    g.moveTo(w - inset - len, inset);
    g.lineTo(w - inset, inset);
    g.lineTo(w - inset, inset + len);
    g.stroke({ color, alpha: 0.8, width: 1 });

    // Bottom-left
    g.moveTo(inset, h - inset - len);
    g.lineTo(inset, h - inset);
    g.lineTo(inset + len, h - inset);
    g.stroke({ color, alpha: 0.8, width: 1 });

    // Bottom-right
    g.moveTo(w - inset - len, h - inset);
    g.lineTo(w - inset, h - inset);
    g.lineTo(w - inset, h - inset - len);
    g.stroke({ color, alpha: 0.8, width: 1 });
  }
}
