import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { ALL_MATERIALS, getBlueprintForBuilding } from '../data/crafting';
import type { BuildingTypeKind } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';

const headerStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

const itemStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0xccaa44,
});

const emptyStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 14,
  fill: 0x2a2418,
});

const countStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 8,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

// ── Layout ──────────────────────────────────────────────────────────

const SLOT_SIZE = 36;
const SLOT_GAP = 4;
const COLS = 5;
const ROWS = 3;
const PADDING = 8;

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

// ── Item slot data ──────────────────────────────────────────────────

interface InventorySlot {
  itemType: string;
  count: number;
}

// ── InventoryHUD class ──────────────────────────────────────────────

export class InventoryHUD {
  readonly container: Container;

  private slots: (InventorySlot | null)[] = new Array(COLS * ROWS).fill(null);
  private slotContainers: Container[] = [];
  private panelBg: Graphics;
  private brackets: Graphics;

  // Texture cache for item icons
  private textures: Map<string, Texture> = new Map();
  private texturesLoaded = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'inventory-hud';

    // Background
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // Brackets
    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // Header
    const header = new Text({ text: 'INVENTORY', style: headerStyle });
    header.x = PADDING + 2;
    header.y = 6;
    this.container.addChild(header);

    // Build grid
    this.buildGrid();
    this.drawPanel();

    // Pre-load item textures
    this.loadTextures();
  }

  // ── Public API ───────────────────────────────────────────────────

  resize(screenWidth: number, screenHeight: number): void {
    const panelW = COLS * (SLOT_SIZE + SLOT_GAP) + PADDING * 2;
    this.container.x = 6;
    this.container.y = screenHeight - this.panelHeight() - 10;
  }

  /** Add an item to the inventory. Stacks if same type exists. */
  addItem(itemType: string): void {
    // Try to stack
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemType === itemType) {
        slot.count++;
        this.redrawSlot(i);
        return;
      }
    }
    // Find empty slot
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { itemType, count: 1 };
        this.redrawSlot(i);
        return;
      }
    }
  }

  /** Remove an item from inventory. */
  removeItem(itemType: string): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemType === itemType) {
        slot.count--;
        if (slot.count <= 0) {
          this.slots[i] = null;
        }
        this.redrawSlot(i);
        return;
      }
    }
  }

  /** Full inventory update from server state. */
  setItems(items: { type: string; count: number }[]): void {
    this.slots.fill(null);
    for (let i = 0; i < Math.min(items.length, this.slots.length); i++) {
      this.slots[i] = { itemType: items[i].type, count: items[i].count };
    }
    for (let i = 0; i < this.slots.length; i++) {
      this.redrawSlot(i);
    }
  }

  // ── Texture loading ─────────────────────────────────────────────

  private getIconPath(itemType: string): string | null {
    if (itemType.startsWith('material:')) {
      const id = itemType.slice('material:'.length);
      return `/icons/crafting_materials/${id}.png`;
    }
    if (itemType.startsWith('blueprint:')) {
      const buildingType = itemType.slice('blueprint:'.length) as BuildingTypeKind;
      const bp = getBlueprintForBuilding(buildingType);
      return bp ? bp.icon : null;
    }
    return null;
  }

  private async loadTextures(): Promise<void> {
    try {
      // Load all material textures
      const materialPromises = ALL_MATERIALS.map(async (m) => {
        const path = `/icons/crafting_materials/${m.id}.png`;
        const tex = await Assets.load<Texture>(path);
        tex.source.scaleMode = 'nearest';
        this.textures.set(`material:${m.id}`, tex);
      });

      await Promise.all(materialPromises);
      this.texturesLoaded = true;

      // Re-render all filled slots now that textures are available
      for (let i = 0; i < this.slots.length; i++) {
        if (this.slots[i]) this.redrawSlot(i);
      }
    } catch (err) {
      console.warn('[inventory] Failed to load textures:', err);
    }
  }

  /** Load a single texture on demand (e.g. blueprint icons) and re-render the slot. */
  private async loadTextureForItem(itemType: string, slotIndex: number): Promise<void> {
    // Skip if already cached or no path available
    if (this.textures.has(itemType)) return;
    const path = this.getIconPath(itemType);
    if (!path) return;

    try {
      const tex = await Assets.load<Texture>(path);
      tex.source.scaleMode = 'nearest';
      this.textures.set(itemType, tex);
      // Re-render the slot if the item is still there
      if (this.slots[slotIndex]?.itemType === itemType) {
        this.redrawSlot(slotIndex);
      }
    } catch (err) {
      console.warn(`[inventory] Failed to load texture for ${itemType}:`, err);
    }
  }

  // ── Private ──────────────────────────────────────────────────────

  private panelHeight(): number {
    return ROWS * (SLOT_SIZE + SLOT_GAP) + 28 + PADDING;
  }

  private drawPanel(): void {
    const panelW = COLS * (SLOT_SIZE + SLOT_GAP) + PADDING * 2 - SLOT_GAP;
    const panelH = this.panelHeight();

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.72 });
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });

    this.brackets.clear();
    drawCornerBrackets(this.brackets, 0, 0, panelW, panelH, 8, 0xd4a017, 0.25);
  }

  private buildGrid(): void {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const slotC = new Container();
        slotC.x = PADDING + col * (SLOT_SIZE + SLOT_GAP);
        slotC.y = 24 + row * (SLOT_SIZE + SLOT_GAP);
        this.container.addChild(slotC);
        this.slotContainers.push(slotC);
        this.drawEmptySlot(slotC);
      }
    }
  }

  private drawEmptySlot(slotC: Container): void {
    while (slotC.children.length > 0) {
      const child = slotC.children[0];
      slotC.removeChild(child);
      child.destroy({ children: true });
    }

    const bg = new Graphics();
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 2);
    bg.fill({ color: 0x111010, alpha: 0.6 });
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 2);
    bg.stroke({ color: 0x2a2418, alpha: 0.3, width: 1 });
    slotC.addChild(bg);

    // Empty slot rune mark
    const rune = new Text({ text: '·', style: emptyStyle });
    rune.x = Math.round((SLOT_SIZE - rune.width) / 2);
    rune.y = Math.round((SLOT_SIZE - rune.height) / 2);
    slotC.addChild(rune);
  }

  private redrawSlot(index: number): void {
    const slotC = this.slotContainers[index];
    if (!slotC) return;

    const slot = this.slots[index];
    if (!slot) {
      this.drawEmptySlot(slotC);
      return;
    }

    // Clear
    while (slotC.children.length > 0) {
      const child = slotC.children[0];
      slotC.removeChild(child);
      child.destroy({ children: true });
    }

    // Filled slot background
    const bg = new Graphics();
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 2);
    bg.fill({ color: 0x1a1510, alpha: 0.8 });
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 2);
    bg.stroke({ color: 0x3a3020, alpha: 0.6, width: 1 });
    slotC.addChild(bg);

    // Item icon (sprite) or text fallback
    let iconRendered = false;
    const tex = this.textures.get(slot.itemType);
    if (tex) {
      const sprite = new Sprite(tex);
      sprite.width = SLOT_SIZE - 8;
      sprite.height = SLOT_SIZE - 8;
      sprite.x = 4;
      sprite.y = 4;
      slotC.addChild(sprite);
      iconRendered = true;
    } else {
      // Attempt async load for textures not yet cached (e.g. blueprints)
      this.loadTextureForItem(slot.itemType, index);
    }

    // Fallback: text abbreviation
    if (!iconRendered) {
      const abbrev = slot.itemType.length > 4
        ? slot.itemType.slice(0, 4)
        : slot.itemType;
      const label = new Text({ text: abbrev, style: itemStyle });
      label.x = Math.round((SLOT_SIZE - label.width) / 2);
      label.y = Math.round((SLOT_SIZE - label.height) / 2) - 4;
      slotC.addChild(label);
    }

    // Count badge (bottom-right)
    if (slot.count > 1) {
      const badge = new Text({ text: `×${slot.count}`, style: countStyle });
      badge.x = SLOT_SIZE - badge.width - 3;
      badge.y = SLOT_SIZE - badge.height - 1;
      slotC.addChild(badge);
    }
  }
}
