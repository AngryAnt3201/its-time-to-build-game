import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';

// ── Style constants ──────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';

const headerStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

const slotLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 8,
  fill: 0x5a5a4a,
});

const emptyRuneStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 18,
  fill: 0x2a2418,
});

// ── Tooltip styles ──────────────────────────────────────────────────

const tooltipNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const tooltipLoreStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x8a7a5a,
});

const tooltipDescStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x9a9a8a,
  wordWrap: true,
  wordWrapWidth: 210,
});

const tooltipStatStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a8a6a,
});

// ── Layout (vertical — weapon on top, armour below) ─────────────────

const SLOT_SIZE = 44;
const SLOT_GAP = 4;
const PADDING = 8;
const HEADER_H = 18;
const LABEL_H = 12;
const PANEL_W = SLOT_SIZE + PADDING * 2;
const PANEL_H = HEADER_H + SLOT_SIZE + LABEL_H + SLOT_GAP + SLOT_SIZE + LABEL_H + PADDING;
const TOOLTIP_W = 230;

// ── Weapon definitions ──────────────────────────────────────────────

export interface WeaponDef {
  id: string;
  name: string;
  loreName: string;
  description: string;
  stat: string;
  icon: string; // path under /icons/weapons/
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'shortsword',
    name: 'Shortsword',
    loreName: 'Process Terminator',
    description: 'Fast, low damage. Excellent against Swarm types.',
    stat: 'ATK: 8  SPD: Fast',
    icon: 'short_sword.png',
  },
  {
    id: 'greatsword',
    name: 'Greatsword',
    loreName: 'Hard Reset',
    description: 'Slow, high damage. Staggers Corruptors off buildings.',
    stat: 'ATK: 24  SPD: Slow',
    icon: 'great_sword.png',
  },
  {
    id: 'staff',
    name: 'Staff',
    loreName: 'Signal Jammer',
    description: 'Interrupts Loopers instantly. Moderate damage to others.',
    stat: 'ATK: 14  SPD: Med',
    icon: 'staff.png',
  },
  {
    id: 'crossbow',
    name: 'Crossbow',
    loreName: 'Null Pointer',
    description: 'Ranged. Essential for semi-invisible Token Drains.',
    stat: 'ATK: 16  RNG: Far',
    icon: 'crossbow.png',
  },
  {
    id: 'torch',
    name: 'Torch Weapon',
    loreName: 'Flare',
    description: 'AOE light burst. Reveals Mimics and Token Drains. Damages Swarms heavily.',
    stat: 'ATK: 10  AOE: Wide',
    icon: 'torch.png',
  },
];

// ── Armour definitions ──────────────────────────────────────────────

export interface ArmourDef {
  id: string;
  name: string;
  loreName: string;
  description: string;
  stat: string;
  icon: string; // path under /icons/armour/
}

export const ARMOURS: ArmourDef[] = [
  {
    id: 'cloth',
    name: 'Cloth',
    loreName: 'Base Prompt',
    description: 'Minimal protection. No movement penalty.',
    stat: 'DEF: 2  SPD: 0%',
    icon: 'cloth.png',
  },
  {
    id: 'leather',
    name: 'Leather',
    loreName: 'Few-Shot Padding',
    description: 'Light and fast. Good for scouts and explorers.',
    stat: 'DEF: 5  SPD: 0%',
    icon: 'leather.png',
  },
  {
    id: 'chain',
    name: 'Chain',
    loreName: 'Chain-of-Thought Mail',
    description: 'Balanced protection. Reliable against most threats.',
    stat: 'DEF: 10  SPD: -10%',
    icon: 'chain.png',
  },
  {
    id: 'plate',
    name: 'Plate',
    loreName: 'Constitutional AI Plate',
    description: 'Maximum protection, movement penalty. Crafted at the Armory.',
    stat: 'DEF: 18  SPD: -25%',
    icon: 'plate.png',
  },
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

// ── EquipmentHUD class ──────────────────────────────────────────────

export class EquipmentHUD {
  readonly container: Container;

  /** The tooltip container — add to the top-level UI so it renders above everything. */
  readonly tooltipContainer: Container;

  onEquipChange: ((kind: 'weapon' | 'armour', id: string) => void) | null = null;

  private equippedWeapon: WeaponDef | null = null;
  private equippedArmour: ArmourDef | null = null;

  private panelBg: Graphics;
  private brackets: Graphics;
  private weaponSlot: Container;
  private armourSlot: Container;
  private weaponIcon: Sprite | null = null;
  private armourIcon: Sprite | null = null;

  // Tooltip elements
  private tooltipBg: Graphics;
  private tooltipBrackets: Graphics;
  private tooltipName: Text;
  private tooltipLore: Text;
  private tooltipDesc: Text;
  private tooltipStat: Text;

  // Texture caches
  private weaponTextures: Map<string, Texture> = new Map();
  private armourTextures: Map<string, Texture> = new Map();
  private loaded = false;

  constructor() {
    this.container = new Container();
    this.container.label = 'equipment-hud';

    // Panel background
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    this.brackets = new Graphics();
    this.container.addChild(this.brackets);

    // Header
    const header = new Text({ text: 'EQUIP', style: headerStyle });
    header.x = PADDING + 2;
    header.y = 4;
    this.container.addChild(header);

    // Weapon slot (top)
    const weaponY = HEADER_H;
    this.weaponSlot = new Container();
    this.weaponSlot.label = 'weapon-slot';
    this.weaponSlot.x = PADDING;
    this.weaponSlot.y = weaponY;
    this.weaponSlot.eventMode = 'static';
    this.weaponSlot.cursor = 'pointer';
    this.container.addChild(this.weaponSlot);

    // Weapon label
    const wLabel = new Text({ text: 'WPN', style: slotLabelStyle });
    wLabel.x = PADDING + Math.round((SLOT_SIZE - wLabel.width) / 2);
    wLabel.y = weaponY + SLOT_SIZE + 1;
    this.container.addChild(wLabel);

    // Armour slot (below weapon)
    const armourY = weaponY + SLOT_SIZE + LABEL_H + SLOT_GAP;
    this.armourSlot = new Container();
    this.armourSlot.label = 'armour-slot';
    this.armourSlot.x = PADDING;
    this.armourSlot.y = armourY;
    this.armourSlot.eventMode = 'static';
    this.armourSlot.cursor = 'pointer';
    this.container.addChild(this.armourSlot);

    // Armour label
    const aLabel = new Text({ text: 'ARM', style: slotLabelStyle });
    aLabel.x = PADDING + Math.round((SLOT_SIZE - aLabel.width) / 2);
    aLabel.y = armourY + SLOT_SIZE + 1;
    this.container.addChild(aLabel);

    // ── Tooltip (separate container, added to UI root for z-order) ──
    this.tooltipContainer = new Container();
    this.tooltipContainer.label = 'equipment-tooltip';
    this.tooltipContainer.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipBrackets = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBrackets);

    this.tooltipName = new Text({ text: '', style: tooltipNameStyle });
    this.tooltipName.x = 10;
    this.tooltipName.y = 8;
    this.tooltipContainer.addChild(this.tooltipName);

    this.tooltipLore = new Text({ text: '', style: tooltipLoreStyle });
    this.tooltipLore.x = 10;
    this.tooltipLore.y = 24;
    this.tooltipContainer.addChild(this.tooltipLore);

    this.tooltipDesc = new Text({ text: '', style: tooltipDescStyle });
    this.tooltipDesc.x = 10;
    this.tooltipDesc.y = 42;
    this.tooltipContainer.addChild(this.tooltipDesc);

    this.tooltipStat = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStat.x = 10;
    this.tooltipContainer.addChild(this.tooltipStat);

    // Draw initial empty slots
    this.drawEmptySlot(this.weaponSlot, '⚔');
    this.drawEmptySlot(this.armourSlot, '🛡');
    this.drawPanel();

    // Hover events
    this.weaponSlot.on('pointerover', () => this.showTooltip('weapon'));
    this.weaponSlot.on('pointerout', () => this.hideTooltip());
    this.weaponSlot.on('pointermove', (e) => this.moveTooltip(e.globalX, e.globalY));
    this.armourSlot.on('pointerover', () => this.showTooltip('armour'));
    this.armourSlot.on('pointerout', () => this.hideTooltip());
    this.armourSlot.on('pointermove', (e) => this.moveTooltip(e.globalX, e.globalY));

    // Load textures
    this.loadTextures();
  }

  // ── Asset loading ───────────────────────────────────────────────

  private async loadTextures(): Promise<void> {
    try {
      const weaponPromises = WEAPONS.map(async (w) => {
        const tex = await Assets.load<Texture>(`/icons/weapons/${w.icon}`);
        tex.source.scaleMode = 'nearest';
        this.weaponTextures.set(w.id, tex);
      });

      const armourPromises = ARMOURS.map(async (a) => {
        const tex = await Assets.load<Texture>(`/icons/armour/${a.icon}`);
        tex.source.scaleMode = 'nearest';
        this.armourTextures.set(a.id, tex);
      });

      await Promise.all([...weaponPromises, ...armourPromises]);
      this.loaded = true;

      // Re-render equipped items if any were set before load
      if (this.equippedWeapon) this.renderWeaponSlot();
      if (this.equippedArmour) this.renderArmourSlot();
    } catch (err) {
      console.warn('[equipment] Failed to load textures:', err);
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  resize(_screenWidth: number, screenHeight: number): void {
    // Inventory panel height ≈ 2×(36+4) + 28 + 8 = 116, positioned at bottom-left with 10px margin.
    // We sit directly above the inventory with a small gap.
    const inventoryH = 116;
    this.container.x = 6;
    this.container.y = screenHeight - inventoryH - 10 - PANEL_H - 6;
  }

  equipWeapon(weaponId: string): void {
    this.equippedWeapon = WEAPONS.find((w) => w.id === weaponId) ?? null;
    this.renderWeaponSlot();
    this.onEquipChange?.('weapon', weaponId);
  }

  equipArmour(armourId: string): void {
    this.equippedArmour = ARMOURS.find((a) => a.id === armourId) ?? null;
    this.renderArmourSlot();
    this.onEquipChange?.('armour', armourId);
  }

  unequipWeapon(): void {
    this.equippedWeapon = null;
    this.clearSlot(this.weaponSlot);
    this.drawEmptySlot(this.weaponSlot, '⚔');
    this.weaponIcon = null;
  }

  unequipArmour(): void {
    this.equippedArmour = null;
    this.clearSlot(this.armourSlot);
    this.drawEmptySlot(this.armourSlot, '🛡');
    this.armourIcon = null;
  }

  // ── Private rendering ────────────────────────────────────────────

  private drawPanel(): void {
    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, PANEL_W, PANEL_H, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.72 });
    this.panelBg.roundRect(0, 0, PANEL_W, PANEL_H, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.4, width: 1 });

    this.brackets.clear();
    drawCornerBrackets(this.brackets, 0, 0, PANEL_W, PANEL_H, 8, 0xd4a017, 0.25);
  }

  private drawEmptySlot(slot: Container, rune: string): void {
    const bg = new Graphics();
    bg.label = 'slot-bg';
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.fill({ color: 0x111010, alpha: 0.7 });
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.stroke({ color: 0x2a2418, alpha: 0.35, width: 1 });
    slot.addChild(bg);

    // Diagonal hatch lines for "empty" feel
    const hatch = new Graphics();
    for (let i = -SLOT_SIZE; i < SLOT_SIZE * 2; i += 8) {
      hatch.moveTo(i, 0);
      hatch.lineTo(i + SLOT_SIZE, SLOT_SIZE);
      hatch.stroke({ color: 0x1a1510, alpha: 0.3, width: 0.5 });
    }
    // Mask to slot bounds — approximate by clipping alpha
    hatch.x = 0;
    hatch.y = 0;
    slot.addChild(hatch);

    const runeText = new Text({ text: rune, style: emptyRuneStyle });
    runeText.x = Math.round((SLOT_SIZE - runeText.width) / 2);
    runeText.y = Math.round((SLOT_SIZE - runeText.height) / 2);
    slot.addChild(runeText);
  }

  private clearSlot(slot: Container): void {
    while (slot.children.length > 0) {
      const child = slot.children[0];
      slot.removeChild(child);
      child.destroy({ children: true });
    }
  }

  private renderWeaponSlot(): void {
    if (!this.equippedWeapon) return;

    this.clearSlot(this.weaponSlot);

    // Slot background — equipped style
    const bg = new Graphics();
    bg.label = 'slot-bg';
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.fill({ color: 0x1a1510, alpha: 0.85 });
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.stroke({ color: 0x4a3a1a, alpha: 0.7, width: 1 });
    this.weaponSlot.addChild(bg);

    // Icon sprite
    if (this.loaded) {
      const tex = this.weaponTextures.get(this.equippedWeapon.id);
      if (tex) {
        this.weaponIcon = new Sprite(tex);
        this.weaponIcon.width = SLOT_SIZE - 8;
        this.weaponIcon.height = SLOT_SIZE - 8;
        this.weaponIcon.x = 4;
        this.weaponIcon.y = 4;
        this.weaponSlot.addChild(this.weaponIcon);
      }
    }
  }

  private renderArmourSlot(): void {
    if (!this.equippedArmour) return;

    this.clearSlot(this.armourSlot);

    const bg = new Graphics();
    bg.label = 'slot-bg';
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.fill({ color: 0x1a1510, alpha: 0.85 });
    bg.roundRect(0, 0, SLOT_SIZE, SLOT_SIZE, 3);
    bg.stroke({ color: 0x4a3a1a, alpha: 0.7, width: 1 });
    this.armourSlot.addChild(bg);

    if (this.loaded) {
      const tex = this.armourTextures.get(this.equippedArmour.id);
      if (tex) {
        this.armourIcon = new Sprite(tex);
        this.armourIcon.width = SLOT_SIZE - 8;
        this.armourIcon.height = SLOT_SIZE - 8;
        this.armourIcon.x = 4;
        this.armourIcon.y = 4;
        this.armourSlot.addChild(this.armourIcon);
      }
    }
  }

  // ── Tooltip ──────────────────────────────────────────────────────

  private showTooltip(kind: 'weapon' | 'armour'): void {
    const item = kind === 'weapon' ? this.equippedWeapon : this.equippedArmour;

    if (!item) {
      // Show empty-slot tooltip
      this.tooltipName.text = kind === 'weapon' ? 'No Weapon' : 'No Armour';
      this.tooltipLore.text = '';
      this.tooltipDesc.text = kind === 'weapon'
        ? 'Equip a weapon to deal damage to rogues.'
        : 'Equip armour to reduce incoming damage.';
      this.tooltipStat.text = '';
    } else {
      this.tooltipName.text = item.name;
      this.tooltipLore.text = `"${item.loreName}"`;
      this.tooltipDesc.text = item.description;
      this.tooltipStat.text = item.stat;
    }

    // Position stat text below desc
    const descBottom = this.tooltipDesc.y + this.tooltipDesc.height;
    this.tooltipStat.y = descBottom + 6;

    // Resize tooltip background to fit content
    const tooltipH = this.tooltipStat.text
      ? this.tooltipStat.y + this.tooltipStat.height + 10
      : descBottom + 10;

    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.fill({ color: 0x0d0b08, alpha: 0.94 });
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.stroke({ color: 0x3a3020, alpha: 0.7, width: 1 });

    this.tooltipBrackets.clear();
    drawCornerBrackets(this.tooltipBrackets, 0, 0, TOOLTIP_W, tooltipH, 6, 0xd4a017, 0.35);

    this.tooltipContainer.visible = true;
  }

  private hideTooltip(): void {
    this.tooltipContainer.visible = false;
  }

  private moveTooltip(globalX: number, globalY: number): void {
    // Offset tooltip to the right and slightly up from cursor
    this.tooltipContainer.x = globalX + 16;
    this.tooltipContainer.y = globalY - 20;
  }
}
