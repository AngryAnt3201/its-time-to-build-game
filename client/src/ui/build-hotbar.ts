import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { BuildingTypeKind } from '../network/protocol';
import { getBlueprintForBuilding } from '../data/crafting';

/** Building types that can have multiple instances (never hidden from hotbar). */
const STACKABLE_TYPES: Set<BuildingTypeKind> = new Set(['Pylon', 'ComputeFarm']);

/** Starter buildings that are always available without crafting. */
const STARTER_TYPES: Set<BuildingTypeKind> = new Set(['Pylon', 'ComputeFarm', 'TodoApp']);

/** Calculate escalating cost: base * 1.5^count (rounded up). */
function escalatingCost(baseCost: number, existingCount: number): number {
  return Math.ceil(baseCost * Math.pow(1.5, existingCount));
}

// ── Style constants ──────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';

const slotKeyStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 8,
  fill: 0x5a5a4a,
});

const slotNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0xd4a017,
});

const slotNameSelectedStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fontWeight: 'bold',
  fill: 0xffe080,
});

const slotCostStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 8,
  fill: 0x6a6a5a,
});

const headerStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

// ── Layout ──────────────────────────────────────────────────────────

const SLOT_W = 64;
const SLOT_H = 48;
const SLOT_GAP = 4;
const PADDING = 8;

// ── Building hotbar entries ─────────────────────────────────────────

export interface HotbarEntry {
  type: BuildingTypeKind;
  name: string;
  cost: number;
  key: string; // display key label
}

const DEFAULT_HOTBAR: HotbarEntry[] = [
  { type: 'Pylon',              name: 'Pylon',    cost: 30,  key: '1' },
  { type: 'ComputeFarm',        name: 'C.Farm',   cost: 80,  key: '2' },
  { type: 'TodoApp',            name: 'Todo',     cost: 50,  key: '3' },
  { type: 'Calculator',         name: 'Calc',     cost: 60,  key: '4' },
  { type: 'LandingPage',        name: 'Landing',  cost: 40,  key: '5' },
  { type: 'WeatherDashboard',   name: 'Weather',  cost: 120, key: '6' },
  { type: 'ChatApp',            name: 'Chat',     cost: 150, key: '7' },
  { type: 'KanbanBoard',        name: 'Kanban',   cost: 130, key: '8' },
  { type: 'EcommerceStore',     name: 'E-com',    cost: 250, key: '9' },
  { type: 'AiImageGenerator',   name: 'AI Img',   cost: 300, key: '0' },
  { type: 'ApiDashboard',       name: 'API',      cost: 280, key: '' },
  { type: 'Blockchain',         name: 'Chain',    cost: 500, key: '' },
];

// ── Corner brackets ─────────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics, x: number, y: number, w: number, h: number,
  size: number, color: number, alpha: number,
): void {
  gfx.moveTo(x, y + size);
  gfx.lineTo(x, y);
  gfx.lineTo(x + size, y);
  gfx.stroke({ color, alpha, width: 1 });

  gfx.moveTo(x + w - size, y);
  gfx.lineTo(x + w, y);
  gfx.lineTo(x + w, y + size);
  gfx.stroke({ color, alpha, width: 1 });

  gfx.moveTo(x + w, y + h - size);
  gfx.lineTo(x + w, y + h);
  gfx.lineTo(x + w - size, y + h);
  gfx.stroke({ color, alpha, width: 1 });

  gfx.moveTo(x + size, y + h);
  gfx.lineTo(x, y + h);
  gfx.lineTo(x, y + h - size);
  gfx.stroke({ color, alpha, width: 1 });
}

// ── BuildHotbar class ───────────────────────────────────────────────

export class BuildHotbar {
  readonly container: Container;

  /** Currently selected slot index (-1 = none). */
  selectedIndex = -1;

  /** Callback when a building is selected from the hotbar. */
  onSelect: ((entry: HotbarEntry) => void) | null = null;

  private entries: HotbarEntry[] = [];
  private panelBg: Graphics;
  private brackets: Graphics;
  private slotContainers: Container[] = [];
  private slotBgs: Graphics[] = [];
  private headerText: Text;
  private lastScreenWidth = 0;
  private lastScreenHeight = 0;

  /** How many of each building type are already placed. */
  private placedBuildingCounts: Map<BuildingTypeKind, number> = new Map();

  /** Which building types the player has crafted/unlocked. */
  private craftedBuildings: Set<string> = new Set();

  constructor() {
    this.container = new Container();
    this.container.label = 'build-hotbar';

    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // Header label (centered)
    this.headerText = new Text({ text: 'BUILD', style: headerStyle });
    this.headerText.x = PADDING + 2;
    this.headerText.y = 4;
    this.container.addChild(this.headerText);

    // Filter entries to only starter buildings before first render
    this.recalculateEntries();
    this.buildSlots();
    this.drawPanel();
  }

  // ── Public API ───────────────────────────────────────────────────

  /** Update which buildings the player has crafted / unlocked. */
  setCraftedBuildings(buildingTypes: string[]): void {
    this.craftedBuildings = new Set(buildingTypes);
    this.recalculateEntries();
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.lastScreenWidth = screenWidth;
    this.lastScreenHeight = screenHeight;
    const panelW = this.panelWidth();
    this.container.x = Math.round((screenWidth - panelW) / 2);
    this.container.y = screenHeight - SLOT_H - 28;
  }

  /** Select a slot by number key (1-7). Returns the entry or null. */
  selectByKey(key: string): HotbarEntry | null {
    const idx = parseInt(key, 10) - 1;
    if (idx < 0 || idx >= this.entries.length) return null;
    return this.selectSlot(idx);
  }

  /** Select a slot by index. */
  selectSlot(index: number): HotbarEntry | null {
    if (index < 0 || index >= this.entries.length) return null;

    // Toggle: if already selected, deselect
    if (this.selectedIndex === index) {
      this.selectedIndex = -1;
      this.highlightSlots();
      return null;
    }

    this.selectedIndex = index;
    this.highlightSlots();

    const entry = this.entries[index];
    if (this.onSelect) {
      this.onSelect(entry);
    }
    return entry;
  }

  /** Clear selection. */
  clearSelection(): void {
    this.selectedIndex = -1;
    this.highlightSlots();
  }

  /** Get the slot index at a local position. Returns 0+ for building slots, -1 for nothing. */
  getSlotAtPosition(localX: number, localY: number): number {
    const slotY = 18; // y offset of slots
    if (localY < slotY || localY > slotY + SLOT_H) return -1;
    const col = Math.floor((localX - PADDING) / (SLOT_W + SLOT_GAP));
    const xInSlot = (localX - PADDING) - col * (SLOT_W + SLOT_GAP);
    if (xInSlot < 0 || xInSlot > SLOT_W) return -1;
    if (col >= 0 && col < this.entries.length) return col;
    return -1;
  }

  /** Get a hotbar entry by index, with escalating cost applied for stackable buildings. */
  getEntry(index: number): HotbarEntry | null {
    if (index < 0 || index >= this.entries.length) return null;
    const entry = this.entries[index];
    if (STACKABLE_TYPES.has(entry.type)) {
      const existingCount = this.placedBuildingCounts.get(entry.type) ?? 0;
      return { ...entry, cost: escalatingCost(entry.cost, existingCount) };
    }
    return entry;
  }

  /** Update placed building counts; triggers entry recalculation. */
  setPlacedBuildingCounts(counts: Map<BuildingTypeKind, number>): void {
    this.placedBuildingCounts = counts;
    this.recalculateEntries();
  }

  /** Refresh the displayed cost on each slot (for escalating prices). */
  private refreshSlotCosts(): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const slot = this.slotContainers[i];
      if (!slot) continue;
      const costText = slot.getChildByLabel('slot-cost') as Text | null;
      if (!costText) continue;

      const displayCost = STACKABLE_TYPES.has(entry.type)
        ? escalatingCost(entry.cost, this.placedBuildingCounts.get(entry.type) ?? 0)
        : entry.cost;
      const newLabel = `${displayCost}◆`;
      if (costText.text !== newLabel) {
        costText.text = newLabel;
        costText.x = Math.round((SLOT_W - costText.width) / 2);
      }
    }
  }

  /** Recalculate which entries to show based on crafted buildings + placed buildings. */
  private recalculateEntries(): void {
    const filtered = DEFAULT_HOTBAR.filter(entry => {
      // Starter buildings (infrastructure + TodoApp) always show
      if (STARTER_TYPES.has(entry.type)) {
        // Stackable buildings always show; non-stackable starters hide if already built
        if (STACKABLE_TYPES.has(entry.type)) return true;
        return (this.placedBuildingCounts.get(entry.type) ?? 0) === 0;
      }
      // Must have crafted the building to show in hotbar
      if (!this.craftedBuildings.has(entry.type)) return false;
      // Non-stackable: hide if already built
      return (this.placedBuildingCounts.get(entry.type) ?? 0) === 0;
    });

    const renumbered = filtered.map((entry, i) => ({
      ...entry,
      key: String(i + 1),
    }));

    const oldTypes = this.entries.map(e => e.type).join(',');
    const newTypes = renumbered.map(e => e.type).join(',');
    if (oldTypes !== newTypes) {
      this.entries = renumbered;
      this.selectedIndex = -1;
      this.rebuildAllSlots();
      return;
    }

    this.refreshSlotCosts();
  }

  /** Tear down and rebuild all slot visuals + panel. */
  private rebuildAllSlots(): void {
    // Remove old slot containers
    for (const slot of this.slotContainers) {
      this.container.removeChild(slot);
      slot.destroy({ children: true });
    }
    this.slotContainers = [];
    this.slotBgs = [];

    this.buildSlots();
    this.drawPanel();

    // Re-center after width change
    if (this.lastScreenWidth > 0) {
      this.resize(this.lastScreenWidth, this.lastScreenHeight);
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private panelWidth(): number {
    return this.entries.length * (SLOT_W + SLOT_GAP) + PADDING * 2 - SLOT_GAP;
  }

  private drawPanel(): void {
    const panelW = this.panelWidth();
    const panelH = SLOT_H + 24;

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.78 });
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.5, width: 1 });

    this.brackets.clear();
    drawCornerBrackets(this.brackets, 0, 0, panelW, panelH, 10, 0xd4a017, 0.3);
  }

  private buildSlots(): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const slot = new Container();
      slot.x = PADDING + i * (SLOT_W + SLOT_GAP);
      slot.y = 18;

      // Slot background
      const bg = new Graphics();
      bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
      bg.fill({ color: 0x111010, alpha: 0.7 });
      bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
      bg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });
      slot.addChild(bg);
      this.slotBgs.push(bg);

      // Key number (top-left)
      const keyText = new Text({ text: entry.key, style: slotKeyStyle });
      keyText.x = 3;
      keyText.y = 1;
      slot.addChild(keyText);

      // Blueprint icon (centered, prominent)
      const bp = getBlueprintForBuilding(entry.type);
      if (bp) {
        Assets.load<Texture>(bp.icon).then((tex) => {
          tex.source.scaleMode = 'nearest';
          const bpSprite = new Sprite(tex);
          bpSprite.label = 'bp-icon';
          bpSprite.width = 24;
          bpSprite.height = 24;
          bpSprite.x = Math.round((SLOT_W - 24) / 2);
          bpSprite.y = 1;
          slot.addChild(bpSprite);
        }).catch(() => { /* texture not found — skip */ });
      }

      // Building name (below icon)
      const nameText = new Text({ text: entry.name, style: slotNameStyle });
      nameText.label = 'slot-name';
      nameText.x = Math.round((SLOT_W - nameText.width) / 2);
      nameText.y = 27;
      slot.addChild(nameText);

      // Cost (bottom) — show escalating cost for stackable buildings
      const displayCost = STACKABLE_TYPES.has(entry.type)
        ? escalatingCost(entry.cost, this.placedBuildingCounts.get(entry.type) ?? 0)
        : entry.cost;
      const costText = new Text({ text: `${displayCost}◆`, style: slotCostStyle });
      costText.label = 'slot-cost';
      costText.x = Math.round((SLOT_W - costText.width) / 2);
      costText.y = 38;
      slot.addChild(costText);

      this.container.addChild(slot);
      this.slotContainers.push(slot);
    }

  }

  private highlightSlots(): void {
    for (let i = 0; i < this.slotContainers.length; i++) {
      const bg = this.slotBgs[i];
      const isSelected = i === this.selectedIndex;

      bg.clear();
      if (isSelected) {
        bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
        bg.fill({ color: 0x2a2010, alpha: 0.9 });
        bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
        bg.stroke({ color: 0xd4a017, alpha: 0.8, width: 1.5 });
      } else {
        bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
        bg.fill({ color: 0x111010, alpha: 0.7 });
        bg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
        bg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });
      }

      // Update name style
      const nameText = this.slotContainers[i].getChildByLabel('slot-name') as Text | null;
      if (nameText) {
        nameText.style = isSelected ? slotNameSelectedStyle : slotNameStyle;
      }
    }
  }
}
