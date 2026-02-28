import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { BuildingTypeKind } from '../network/protocol';

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
  { type: 'Pylon',         name: 'Pylon',    cost: 30,  key: '1' },
  { type: 'ComputeFarm',   name: 'C.Farm',   cost: 80,  key: '2' },
  { type: 'TodoApp',       name: 'Todo',     cost: 50,  key: '3' },
  { type: 'Calculator',    name: 'Calc',     cost: 60,  key: '4' },
  { type: 'LandingPage',   name: 'Landing',  cost: 40,  key: '5' },
  { type: 'WeatherDashboard', name: 'Weather', cost: 120, key: '6' },
  { type: 'ChatApp',       name: 'Chat',     cost: 150, key: '7' },
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

  /** Callback when the "+" browser button is activated. */
  onOpenBrowser: (() => void) | null = null;

  private entries: HotbarEntry[] = DEFAULT_HOTBAR;
  private panelBg: Graphics;
  private brackets: Graphics;
  private slotContainers: Container[] = [];
  private slotBgs: Graphics[] = [];

  constructor() {
    this.container = new Container();
    this.container.label = 'build-hotbar';

    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // Header label (centered)
    const header = new Text({ text: 'BUILD', style: headerStyle });
    header.x = PADDING + 2;
    header.y = 4;
    this.container.addChild(header);

    this.buildSlots();
    this.drawPanel();
  }

  // ── Public API ───────────────────────────────────────────────────

  resize(screenWidth: number, screenHeight: number): void {
    const panelW = this.panelWidth();
    this.container.x = Math.round((screenWidth - panelW) / 2);
    this.container.y = screenHeight - SLOT_H - 28;
  }

  /** Select a slot by number key (1-7), or '0' to open the building browser. Returns the entry or null. */
  selectByKey(key: string): HotbarEntry | null {
    if (key === '0') {
      if (this.onOpenBrowser) this.onOpenBrowser();
      return null;
    }
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

  /** Get the slot index at a local position. Returns 0-6 for building slots, -2 for '+' button, -1 for nothing. */
  getSlotAtPosition(localX: number, localY: number): number {
    const slotY = 18; // y offset of slots
    if (localY < slotY || localY > slotY + SLOT_H) return -1;
    const col = Math.floor((localX - PADDING) / (SLOT_W + SLOT_GAP));
    const xInSlot = (localX - PADDING) - col * (SLOT_W + SLOT_GAP);
    if (xInSlot < 0 || xInSlot > SLOT_W) return -1;
    if (col >= 0 && col < this.entries.length) return col;
    if (col === this.entries.length) return -2; // "+" button
    return -1;
  }

  /** Get a hotbar entry by index. */
  getEntry(index: number): HotbarEntry | null {
    if (index < 0 || index >= this.entries.length) return null;
    return this.entries[index];
  }

  // ── Private ──────────────────────────────────────────────────────

  private panelWidth(): number {
    return (this.entries.length + 1) * (SLOT_W + SLOT_GAP) + PADDING * 2 - SLOT_GAP;
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

      // Building name (centered)
      const nameText = new Text({ text: entry.name, style: slotNameStyle });
      nameText.label = 'slot-name';
      nameText.x = Math.round((SLOT_W - nameText.width) / 2);
      nameText.y = 12;
      slot.addChild(nameText);

      // Cost (bottom)
      const costText = new Text({ text: `${entry.cost}◆`, style: slotCostStyle });
      costText.x = Math.round((SLOT_W - costText.width) / 2);
      costText.y = SLOT_H - 14;
      slot.addChild(costText);

      this.container.addChild(slot);
      this.slotContainers.push(slot);
    }

    // "+" browser button (8th slot)
    const plusSlot = new Container();
    plusSlot.x = PADDING + this.entries.length * (SLOT_W + SLOT_GAP);
    plusSlot.y = 18;

    const plusBg = new Graphics();
    plusBg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
    plusBg.fill({ color: 0x111010, alpha: 0.5 });
    plusBg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
    plusBg.stroke({ color: 0x3a3a2a, alpha: 0.4, width: 1 });
    plusSlot.addChild(plusBg);

    const plusKeyText = new Text({ text: '0', style: slotKeyStyle });
    plusKeyText.x = 3;
    plusKeyText.y = 1;
    plusSlot.addChild(plusKeyText);

    const plusLabel = new Text({
      text: '+',
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 18,
        fill: 0x7a6a3a,
      }),
    });
    plusLabel.x = Math.round((SLOT_W - plusLabel.width) / 2);
    plusLabel.y = Math.round((SLOT_H - plusLabel.height) / 2);
    plusSlot.addChild(plusLabel);

    this.container.addChild(plusSlot);
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
