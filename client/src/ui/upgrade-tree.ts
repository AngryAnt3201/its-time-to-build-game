import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { ALL_RECIPES, type CraftingRecipe, getMaterial } from '../data/crafting';

// ── Style constants ──────────────────────────────────────────────────

const FONT_FAMILY = '"IBM Plex Mono", monospace';

const titleStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 18,
  fontWeight: 'bold',
  fill: 0xd4a017, // amber
});

const tierLabelStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fontWeight: 'bold',
  fill: 0x888888,
});

const nameStylePurchased = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fill: 0x44cc66, // green — purchased
});

const nameStyleAvailable = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fill: 0xd4a017, // amber — available
});

const nameStyleLocked = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  fill: 0x666666, // grey — locked
});

const costStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 11,
  fill: 0x888888,
});

const descStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x555555,
});

const matCostStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 9,
  fill: 0x8a6a3a,  // muted amber
});

const instructionStyle = new TextStyle({
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fill: 0x555555,
});

// ── Upgrade data ────────────────────────────────────────────────────

export type UpgradeStatus = 'purchased' | 'available' | 'locked';

export interface UpgradeEntry {
  id: string;
  name: string;
  tier: number;
  cost: number;
  description: string;
  prerequisite: string | null;
}

const ALL_UPGRADES: UpgradeEntry[] = [
  // Tier 1 -- Foundations
  {
    id: 'ExpandedContextWindow',
    name: 'Expanded Context Window',
    tier: 1,
    cost: 100,
    description: 'Agents handle larger blueprints',
    prerequisite: null,
  },
  {
    id: 'VerboseLogging',
    name: 'Verbose Logging',
    tier: 1,
    cost: 75,
    description: 'Agent states visible further',
    prerequisite: null,
  },
  {
    id: 'TokenCompression',
    name: 'Token Compression',
    tier: 1,
    cost: 120,
    description: 'Reduced upkeep',
    prerequisite: null,
  },
  // Tier 2 -- Tooling
  {
    id: 'GitAccess',
    name: 'Git Access',
    tier: 2,
    cost: 200,
    description: 'Extended recovery window',
    prerequisite: 'ExpandedContextWindow',
  },
  {
    id: 'WebSearch',
    name: 'Web Search',
    tier: 2,
    cost: 180,
    description: 'Agents explore better',
    prerequisite: 'VerboseLogging',
  },
  {
    id: 'FileSystemAccess',
    name: 'File System Access',
    tier: 2,
    cost: 250,
    description: 'Faster builds',
    prerequisite: 'TokenCompression',
  },
  {
    id: 'CrankAssignment',
    name: 'Crank Assignment',
    tier: 2,
    cost: 150,
    description: 'Assign agent to crank',
    prerequisite: 'TokenCompression',
  },
  // Tier 3 -- Infrastructure
  {
    id: 'MultiAgentCoordination',
    name: 'Multi-Agent Coordination',
    tier: 3,
    cost: 400,
    description: 'Agents collaborate',
    prerequisite: 'GitAccess',
  },
  {
    id: 'PersistentMemory',
    name: 'Persistent Memory',
    tier: 3,
    cost: 350,
    description: 'Better XP retention',
    prerequisite: 'WebSearch',
  },
  {
    id: 'AutonomousScouting',
    name: 'Autonomous Scouting',
    tier: 3,
    cost: 300,
    description: 'Self-assign exploration',
    prerequisite: 'FileSystemAccess',
  },
  // Tier 4 -- Late Game
  {
    id: 'AgentSpawning',
    name: 'Agent Spawning',
    tier: 4,
    cost: 600,
    description: 'Agents recruit agents',
    prerequisite: 'MultiAgentCoordination',
  },
  {
    id: 'DistributedCompute',
    name: 'Distributed Compute',
    tier: 4,
    cost: 500,
    description: 'Token gen scales with agents',
    prerequisite: 'PersistentMemory',
  },
  {
    id: 'AlignmentProtocols',
    name: 'Alignment Protocols',
    tier: 4,
    cost: 800,
    description: 'Reduced rogue spawns',
    prerequisite: 'AutonomousScouting',
  },
];

// ── Layout constants ────────────────────────────────────────────────

const PANEL_WIDTH = 460;
const PANEL_HEIGHT = 540;
const ROW_HEIGHT = 60;
const TIER_HEADER_HEIGHT = 28;
const SCROLL_TOP = 44;
const VISIBLE_HEIGHT = PANEL_HEIGHT - SCROLL_TOP - 30; // leave room for instructions

/**
 * Upgrade tree overlay panel.
 *
 * Toggle with 'U' key.  Shows all upgrades grouped by tier with
 * colour-coded states:
 *  - green  = purchased
 *  - amber  = available (affordable + prerequisite met)
 *  - grey   = locked (can't afford or missing prerequisite)
 */
export class UpgradeTree {
  readonly container: Container;

  /** Whether the panel is currently visible. */
  visible = false;

  /** Callback fired when the player purchases an upgrade. */
  onPurchase: ((upgradeId: string) => void) | null = null;

  private selectedIndex = 0;
  private scrollOffset = 0;

  // Flat list of items in display order (tier headers are not selectable)
  private flatItems: Array<{ kind: 'tier'; tier: number } | { kind: 'upgrade'; entry: UpgradeEntry; flatIdx: number }> = [];
  // Only the selectable (upgrade) indices within flatItems
  private selectableIndices: number[] = [];

  // State tracking
  private purchasedIds: Set<string> = new Set();
  private currentBalance = 0;

  // Panel elements
  private panel: Graphics;
  private titleText: Text;
  private instructionText: Text;
  private scrollContainer: Container;
  private rowContainers: Container[] = [];

  constructor() {
    this.container = new Container();
    this.container.label = 'upgrade-tree';
    this.container.visible = false;

    // ── Panel background ──────────────────────────────────────────
    this.panel = new Graphics();
    this.container.addChild(this.panel);

    // ── Title ─────────────────────────────────────────────────────
    this.titleText = new Text({ text: 'UPGRADES', style: titleStyle });
    this.titleText.x = 16;
    this.titleText.y = 12;
    this.container.addChild(this.titleText);

    // ── Instructions at bottom ────────────────────────────────────
    this.instructionText = new Text({
      text: '[Up/Down] select   [Enter] purchase   [Esc/U] close',
      style: instructionStyle,
    });
    this.instructionText.x = 16;
    this.container.addChild(this.instructionText);

    // ── Scrollable content area ───────────────────────────────────
    this.scrollContainer = new Container();
    this.scrollContainer.x = 0;
    this.scrollContainer.y = SCROLL_TOP;
    this.container.addChild(this.scrollContainer);

    // Build the flat item list
    this.buildFlatItems();
    this.rebuildRows();
    this.layoutPanel();
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Toggle the panel open/closed. */
  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) {
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.rebuildRows();
    }
  }

  /** Close the panel. */
  close(): void {
    this.visible = false;
    this.container.visible = false;
  }

  /** Move selection up. */
  selectPrev(): void {
    if (!this.visible || this.selectableIndices.length === 0) return;
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    this.ensureVisible();
    this.highlightSelected();
  }

  /** Move selection down. */
  selectNext(): void {
    if (!this.visible || this.selectableIndices.length === 0) return;
    this.selectedIndex = Math.min(this.selectableIndices.length - 1, this.selectedIndex + 1);
    this.ensureVisible();
    this.highlightSelected();
  }

  /** Attempt to purchase the currently selected upgrade. */
  confirmSelection(): void {
    if (!this.visible || this.selectableIndices.length === 0) return;
    const flatIdx = this.selectableIndices[this.selectedIndex];
    const item = this.flatItems[flatIdx];
    if (item.kind !== 'upgrade') return;

    const status = this.getStatus(item.entry);
    if (status !== 'available') return;

    if (this.onPurchase) {
      this.onPurchase(item.entry.id);
    }

    // Optimistically mark as purchased for immediate UI feedback
    this.purchasedIds.add(item.entry.id);
    this.currentBalance -= item.entry.cost;
    this.rebuildRows();
  }

  /** Update economy / purchased state from the server. */
  updateState(balance: number, purchasedIds: string[]): void {
    this.currentBalance = balance;
    this.purchasedIds = new Set(purchasedIds);
    if (this.visible) {
      this.rebuildRows();
    }
  }

  /** Returns true if the panel is blocking normal input. */
  get isBlocking(): boolean {
    return this.visible;
  }

  /** Reposition the panel for the current screen size. */
  resize(screenWidth: number, screenHeight: number): void {
    this.container.x = Math.round((screenWidth - PANEL_WIDTH) / 2);
    this.container.y = Math.round((screenHeight - PANEL_HEIGHT) / 2);
  }

  // ── Private helpers ─────────────────────────────────────────────

  private getStatus(entry: UpgradeEntry): UpgradeStatus {
    if (this.purchasedIds.has(entry.id)) return 'purchased';
    const prereqMet = entry.prerequisite === null || this.purchasedIds.has(entry.prerequisite);
    const canAfford = this.currentBalance >= entry.cost;
    if (prereqMet && canAfford) return 'available';
    return 'locked';
  }

  private buildFlatItems(): void {
    this.flatItems = [];
    this.selectableIndices = [];

    const tiers = [1, 2, 3, 4];
    const tierNames = ['Foundations', 'Tooling', 'Infrastructure', 'Late Game'];

    for (let ti = 0; ti < tiers.length; ti++) {
      const tier = tiers[ti];
      this.flatItems.push({ kind: 'tier', tier });

      const tierUpgrades = ALL_UPGRADES.filter(u => u.tier === tier);
      for (const entry of tierUpgrades) {
        const flatIdx = this.flatItems.length;
        this.selectableIndices.push(flatIdx);
        this.flatItems.push({ kind: 'upgrade', entry, flatIdx });
      }
    }

    // Store tier names for use in rendering
    (this as Record<string, unknown>)._tierNames = tierNames;
  }

  private layoutPanel(): void {
    this.panel.clear();
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.fill({ color: 0x1a1510, alpha: 0.92 });
    this.panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 4);
    this.panel.stroke({ color: 0x3a3020, alpha: 0.8, width: 1 });

    this.instructionText.y = PANEL_HEIGHT - 24;
  }

  private rebuildRows(): void {
    // Remove old rows
    for (const row of this.rowContainers) {
      this.scrollContainer.removeChild(row);
      row.destroy({ children: true });
    }
    this.rowContainers = [];

    const tierNames: Record<number, string> = {
      1: 'Tier 1 -- Foundations',
      2: 'Tier 2 -- Tooling',
      3: 'Tier 3 -- Infrastructure',
      4: 'Tier 4 -- Late Game',
    };

    let yOffset = 0;
    let selectableIdx = 0;

    for (const item of this.flatItems) {
      if (item.kind === 'tier') {
        // Tier header row
        const row = new Container();
        row.label = `tier-header-${item.tier}`;

        const label = new Text({
          text: tierNames[item.tier] ?? `Tier ${item.tier}`,
          style: tierLabelStyle,
        });
        label.x = 12;
        label.y = 6;
        row.addChild(label);

        row.x = 0;
        row.y = yOffset;
        this.scrollContainer.addChild(row);
        this.rowContainers.push(row);
        yOffset += TIER_HEADER_HEIGHT;
      } else {
        // Upgrade row
        const entry = item.entry;
        const status = this.getStatus(entry);
        const isSelected = selectableIdx === this.selectedIndex;

        const row = new Container();
        row.label = `upgrade-row-${entry.id}`;

        // Row background
        const bg = new Graphics();
        bg.label = 'row-bg';
        if (isSelected) {
          bg.roundRect(4, 0, PANEL_WIDTH - 24, ROW_HEIGHT - 4, 2);
          bg.fill({ color: 0x2a2010, alpha: 0.6 });
          bg.roundRect(4, 0, PANEL_WIDTH - 24, ROW_HEIGHT - 4, 2);
          bg.stroke({ color: 0xd4a017, alpha: 0.8, width: 1 });
        } else {
          bg.roundRect(4, 0, PANEL_WIDTH - 24, ROW_HEIGHT - 4, 2);
          bg.fill({ color: 0x2a2010, alpha: 0 });
        }
        row.addChild(bg);

        // Status indicator (small coloured dot)
        const dot = new Graphics();
        const dotColor = status === 'purchased' ? 0x44cc66 : status === 'available' ? 0xd4a017 : 0x444444;
        dot.circle(16, ROW_HEIGHT / 2 - 2, 4);
        dot.fill(dotColor);
        row.addChild(dot);

        // Upgrade name
        const nameTextStyle = status === 'purchased' ? nameStylePurchased : status === 'available' ? nameStyleAvailable : nameStyleLocked;
        const name = new Text({ text: entry.name, style: nameTextStyle });
        name.x = 28;
        name.y = 4;
        row.addChild(name);

        // Cost (or "OWNED" if purchased)
        const costLabel = status === 'purchased' ? 'OWNED' : `${entry.cost} tokens`;
        const cost = new Text({ text: costLabel, style: costStyle });
        cost.x = PANEL_WIDTH - 130;
        cost.y = 6;
        row.addChild(cost);

        // Description
        const desc = new Text({ text: entry.description, style: descStyle });
        desc.x = 28;
        desc.y = 22;
        row.addChild(desc);

        // Material requirements
        const recipe = ALL_RECIPES.find(r => r.category === 'upgrade' && r.result === entry.id);
        if (recipe && recipe.ingredients.length > 0) {
          const matText = recipe.ingredients
            .map(ing => {
              const mat = getMaterial(ing.material);
              return `${ing.count}\u00d7 ${mat?.name ?? ing.material}`;
            })
            .join(', ');

          const matLabel = new Text({ text: matText, style: matCostStyle });
          matLabel.x = 28;
          matLabel.y = 32;
          row.addChild(matLabel);
        }

        row.x = 8;
        row.y = yOffset;
        this.scrollContainer.addChild(row);
        this.rowContainers.push(row);
        yOffset += ROW_HEIGHT;

        selectableIdx++;
      }
    }

    // Apply scroll clipping via position offset
    this.applyScroll();
  }

  private ensureVisible(): void {
    // Calculate the y position of the selected item and ensure it's within
    // the visible scroll area.  We use a simple approach: count items up to
    // the selected one.
    const flatIdx = this.selectableIndices[this.selectedIndex];
    let yPos = 0;
    for (let i = 0; i < this.flatItems.length; i++) {
      if (i === flatIdx) break;
      yPos += this.flatItems[i].kind === 'tier' ? TIER_HEADER_HEIGHT : ROW_HEIGHT;
    }

    if (yPos < this.scrollOffset) {
      this.scrollOffset = yPos;
    }
    const itemHeight = ROW_HEIGHT;
    if (yPos + itemHeight > this.scrollOffset + VISIBLE_HEIGHT) {
      this.scrollOffset = yPos + itemHeight - VISIBLE_HEIGHT;
    }
    this.applyScroll();
  }

  private applyScroll(): void {
    this.scrollContainer.y = SCROLL_TOP - this.scrollOffset;
  }

  private highlightSelected(): void {
    // Full rebuild is simple and fast enough for 13 upgrades + 4 headers
    this.rebuildRows();
  }
}
