import {
  ALL_RECIPES,
  getRecipesByCategory,
  canCraft,
  materialItemType,
  blueprintItemType,
  getMaterial,
  getBlueprintForBuilding,
  type CraftingRecipe,
  type RecipeCategory,
} from '../data/crafting';
import { buildingTypeToId } from '../data/buildings';
import type { PlayerAction, InventoryItem } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = "'IBM Plex Mono', monospace";
const gold = '#d4a017';
const darkBg = '#1a1a1a';
const panelBg = '#2a2a1a';

// ── Tab definitions ──────────────────────────────────────────────────

type TabId = 'apps' | 'forge' | 'upgrades';

interface TabDef {
  id: TabId;
  label: string;
  categories: RecipeCategory[];
}

const TABS: TabDef[] = [
  { id: 'apps', label: 'Apps', categories: ['app'] },
  { id: 'forge', label: 'Forge', categories: ['weapon', 'armour'] },
  { id: 'upgrades', label: 'Agent Upgrades', categories: ['upgrade'] },
];

// ── CraftingModal ────────────────────────────────────────────────────

export interface CraftingModalCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class CraftingModal {
  visible = false;

  private readonly container: HTMLDivElement;
  private readonly tabButtons: Map<TabId, HTMLButtonElement> = new Map();
  private readonly contentArea: HTMLDivElement;
  private readonly callbacks: CraftingModalCallbacks;

  private activeTab: TabId = 'apps';
  private inventory: Map<string, number> = new Map();
  private tokens = 0;
  private purchasedUpgrades: Set<string> = new Set();
  private craftedRecipes: Set<string> = new Set();

  constructor(callbacks: CraftingModalCallbacks) {
    this.callbacks = callbacks;

    // ── Container ─────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'crafting-modal';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '550px',
      maxHeight: '80vh',
      background: darkBg,
      border: `2px solid ${gold}`,
      borderRadius: '8px',
      boxShadow: `0 0 40px rgba(0,0,0,0.8), 0 0 8px ${gold}33`,
      zIndex: '1000',
      display: 'none',
      flexDirection: 'column',
      fontFamily: FONT,
      color: '#e0d8c0',
      overflow: 'hidden',
    });

    // ── Header with tabs ─────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '0',
      borderBottom: '1px solid #3a3020',
      flexShrink: '0',
    });

    for (const tab of TABS) {
      const btn = this.makeTabButton(tab.label, tab.id === this.activeTab);
      btn.addEventListener('click', () => this.switchTab(tab.id));
      this.tabButtons.set(tab.id, btn);
      header.appendChild(btn);
    }

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    header.appendChild(spacer);

    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      padding: '4px 14px',
      margin: '8px 12px',
      fontSize: '12px',
      fontFamily: FONT,
      fontWeight: 'bold',
      background: '#2a2418',
      color: '#8b4444',
      border: '1px solid #8b4444',
      borderRadius: '4px',
      cursor: 'pointer',
    });
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.close());
    header.appendChild(closeBtn);

    // ── Scrollable content area ──────────────────────────────────
    this.contentArea = document.createElement('div');
    Object.assign(this.contentArea.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      background: panelBg,
    });

    // Custom scrollbar styling
    const styleTag = document.createElement('style');
    styleTag.textContent = `
      #crafting-modal .crafting-scroll::-webkit-scrollbar {
        width: 6px;
      }
      #crafting-modal .crafting-scroll::-webkit-scrollbar-track {
        background: #1a1a1a;
      }
      #crafting-modal .crafting-scroll::-webkit-scrollbar-thumb {
        background: #3a3020;
        border-radius: 3px;
      }
      #crafting-modal .crafting-scroll::-webkit-scrollbar-thumb:hover {
        background: ${gold};
      }
    `;
    document.head.appendChild(styleTag);
    this.contentArea.classList.add('crafting-scroll');

    // ── Assemble ─────────────────────────────────────────────────
    this.container.appendChild(header);
    this.container.appendChild(this.contentArea);
    document.body.appendChild(this.container);
  }

  // ── Public API ──────────────────────────────────────────────────

  open(): void {
    this.container.style.display = 'flex';
    this.visible = true;
    this.switchTab(this.activeTab);
  }

  close(): void {
    this.container.style.display = 'none';
    this.visible = false;
    this.callbacks.onClose();
  }

  updateInventory(items: InventoryItem[]): void {
    // Build new inventory map and compare to current — only re-render if changed
    const next = new Map<string, number>();
    for (const item of items) {
      next.set(item.item_type, (next.get(item.item_type) ?? 0) + item.count);
    }
    if (!this.mapsEqual(this.inventory, next)) {
      this.inventory = next;
      if (this.visible) this.renderCards();
    }
  }

  updateTokens(balance: number): void {
    if (this.tokens !== balance) {
      this.tokens = balance;
      if (this.visible) this.renderCards();
    }
  }

  updatePurchasedUpgrades(ids: string[]): void {
    const next = new Set(ids);
    if (!this.setsEqual(this.purchasedUpgrades, next)) {
      this.purchasedUpgrades = next;
      if (this.visible) this.renderCards();
    }
  }

  updateCraftedRecipes(ids: string[]): void {
    const next = new Set(ids);
    if (!this.setsEqual(this.craftedRecipes, next)) {
      this.craftedRecipes = next;
      if (this.visible) this.renderCards();
    }
  }

  private mapsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) {
      if (b.get(k) !== v) return false;
    }
    return true;
  }

  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const v of a) {
      if (!b.has(v)) return false;
    }
    return true;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private switchTab(tabId: TabId): void {
    this.activeTab = tabId;
    for (const [id, btn] of this.tabButtons) {
      this.setTabActive(btn, id === tabId);
    }
    this.renderCards();
  }

  private renderCards(): void {
    this.contentArea.innerHTML = '';

    const tabDef = TABS.find(t => t.id === this.activeTab)!;
    const recipes: CraftingRecipe[] = [];
    for (const cat of tabDef.categories) {
      recipes.push(...getRecipesByCategory(cat));
    }

    if (recipes.length === 0) {
      const empty = document.createElement('p');
      Object.assign(empty.style, {
        margin: '40px 0',
        fontSize: '13px',
        color: '#666',
        fontFamily: FONT,
        fontStyle: 'italic',
        textAlign: 'center',
      });
      empty.textContent = 'No recipes available.';
      this.contentArea.appendChild(empty);
      return;
    }

    for (const recipe of recipes) {
      this.contentArea.appendChild(this.buildRecipeCard(recipe));
    }
  }

  private buildRecipeCard(recipe: CraftingRecipe): HTMLDivElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#222',
      border: '1px solid #3a3020',
      borderRadius: '6px',
      padding: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
    });

    // ── Left side: Blueprint icon (apps only) ────────────────────
    if (recipe.blueprint) {
      const bpDef = getBlueprintForBuilding(recipe.blueprint);
      const bpKey = blueprintItemType(recipe.blueprint);
      const hasBlueprint = (this.inventory.get(bpKey) ?? 0) >= 1;

      const bpImg = document.createElement('img');
      bpImg.src = bpDef?.icon ?? '';
      bpImg.width = 32;
      bpImg.height = 32;
      Object.assign(bpImg.style, {
        imageRendering: 'pixelated',
        flexShrink: '0',
        opacity: hasBlueprint ? '1' : '0.3',
        filter: hasBlueprint ? 'none' : 'grayscale(100%)',
      });
      bpImg.title = hasBlueprint
        ? `Blueprint: ${recipe.blueprint}`
        : `Missing blueprint: ${recipe.blueprint}`;
      card.appendChild(bpImg);
    }

    // ── Center: name, description, ingredients ───────────────────
    const center = document.createElement('div');
    Object.assign(center.style, {
      flex: '1',
      minWidth: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });

    const nameEl = document.createElement('div');
    Object.assign(nameEl.style, {
      fontWeight: 'bold',
      fontSize: '13px',
      color: '#e0d8c0',
      fontFamily: FONT,
    });
    nameEl.textContent = recipe.name;
    center.appendChild(nameEl);

    const descEl = document.createElement('div');
    Object.assign(descEl.style, {
      fontStyle: 'italic',
      fontSize: '11px',
      color: '#888',
      fontFamily: FONT,
      lineHeight: '1.3',
    });
    descEl.textContent = recipe.description;
    center.appendChild(descEl);

    // Ingredient row
    const ingredientRow = document.createElement('div');
    Object.assign(ingredientRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      flexWrap: 'wrap',
      marginTop: '4px',
    });

    // Blueprint requirement indicator (for apps)
    if (recipe.blueprint) {
      const bpKey = blueprintItemType(recipe.blueprint);
      const hasBlueprint = (this.inventory.get(bpKey) ?? 0) >= 1;

      const bpChip = document.createElement('div');
      Object.assign(bpChip.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      });

      const bpLabel = document.createElement('span');
      Object.assign(bpLabel.style, {
        fontSize: '11px',
        fontFamily: FONT,
        color: hasBlueprint ? '#6a6' : '#a44',
      });
      bpLabel.textContent = hasBlueprint ? 'BP' : 'BP';
      bpLabel.title = hasBlueprint ? 'Blueprint owned' : 'Blueprint required';
      bpChip.appendChild(bpLabel);

      ingredientRow.appendChild(bpChip);
    }

    // Material ingredients
    for (const ing of recipe.ingredients) {
      const matDef = getMaterial(ing.material);
      const matKey = materialItemType(ing.material);
      const have = this.inventory.get(matKey) ?? 0;
      const enough = have >= ing.count;

      const chip = document.createElement('div');
      Object.assign(chip.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      });

      const icon = document.createElement('img');
      icon.src = `/icons/crafting_materials/${ing.material}.png`;
      icon.width = 20;
      icon.height = 20;
      Object.assign(icon.style, {
        imageRendering: 'pixelated',
      });
      icon.title = matDef?.name ?? ing.material;
      chip.appendChild(icon);

      const countEl = document.createElement('span');
      Object.assign(countEl.style, {
        fontSize: '11px',
        fontFamily: FONT,
        fontWeight: 'bold',
        color: enough ? '#6a6' : '#a44',
      });
      countEl.textContent = `${have}/${ing.count}`;
      chip.appendChild(countEl);

      ingredientRow.appendChild(chip);
    }

    // Token cost (for upgrades)
    if (recipe.tokenCost !== undefined) {
      const tokenEnough = this.tokens >= recipe.tokenCost;
      const tokenChip = document.createElement('div');
      Object.assign(tokenChip.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '3px',
      });

      const tokenLabel = document.createElement('span');
      Object.assign(tokenLabel.style, {
        fontSize: '11px',
        fontFamily: FONT,
        fontWeight: 'bold',
        color: tokenEnough ? '#6a6' : '#a44',
      });
      tokenLabel.textContent = `${recipe.tokenCost} tokens`;
      tokenChip.appendChild(tokenLabel);

      ingredientRow.appendChild(tokenChip);
    }

    center.appendChild(ingredientRow);

    // Prerequisite note (for upgrades)
    if (recipe.prerequisite && !this.purchasedUpgrades.has(recipe.prerequisite)) {
      const prereqName = ALL_RECIPES.find(r => r.result === recipe.prerequisite)?.name ?? recipe.prerequisite;
      const prereqEl = document.createElement('div');
      Object.assign(prereqEl.style, {
        fontSize: '10px',
        fontFamily: FONT,
        color: '#a44',
        marginTop: '2px',
      });
      prereqEl.textContent = `Requires: ${prereqName}`;
      center.appendChild(prereqEl);
    }

    card.appendChild(center);

    // ── Right side: Craft button or CRAFTED label ────────────────
    const rightSide = document.createElement('div');
    Object.assign(rightSide.style, {
      flexShrink: '0',
      display: 'flex',
      alignItems: 'center',
    });

    const isCrafted = this.craftedRecipes.has(recipe.id);

    // Upgrades use purchasedUpgrades to determine "already crafted"
    const isUpgradePurchased =
      recipe.category === 'upgrade' && this.purchasedUpgrades.has(recipe.result);

    if (isCrafted || isUpgradePurchased) {
      const craftedLabel = document.createElement('span');
      Object.assign(craftedLabel.style, {
        fontSize: '11px',
        fontFamily: FONT,
        fontWeight: 'bold',
        color: '#6a6',
        padding: '4px 10px',
      });
      craftedLabel.textContent = 'CRAFTED';
      rightSide.appendChild(craftedLabel);
    } else {
      const craftable = canCraft(recipe, this.inventory, this.tokens, this.purchasedUpgrades);

      const craftBtn = document.createElement('button');
      Object.assign(craftBtn.style, {
        padding: '6px 14px',
        fontSize: '11px',
        fontFamily: FONT,
        fontWeight: 'bold',
        background: 'transparent',
        color: craftable ? gold : '#555',
        border: `1px solid ${craftable ? gold : '#555'}`,
        borderRadius: '4px',
        cursor: craftable ? 'pointer' : 'default',
        opacity: craftable ? '1' : '0.6',
        whiteSpace: 'nowrap',
      });
      craftBtn.textContent = 'Craft';
      craftBtn.disabled = !craftable;

      if (craftable) {
        craftBtn.addEventListener('mouseenter', () => {
          craftBtn.style.background = `${gold}22`;
        });
        craftBtn.addEventListener('mouseleave', () => {
          craftBtn.style.background = 'transparent';
        });
        craftBtn.addEventListener('click', () => this.handleCraft(recipe));
      }

      rightSide.appendChild(craftBtn);
    }

    card.appendChild(rightSide);
    return card;
  }

  private handleCraft(recipe: CraftingRecipe): void {
    // 1. Remove material ingredients (send to server + update local state)
    for (const ing of recipe.ingredients) {
      this.callbacks.onAction({
        RemoveInventoryItem: {
          item_type: materialItemType(ing.material),
          count: ing.count,
        },
      });

      // Update local inventory immediately so UI responds
      const matKey = materialItemType(ing.material);
      const current = this.inventory.get(matKey) ?? 0;
      const remaining = Math.max(0, current - ing.count);
      if (remaining > 0) {
        this.inventory.set(matKey, remaining);
      } else {
        this.inventory.delete(matKey);
      }
    }

    // 2. Deduct tokens locally for upgrades
    if (recipe.tokenCost !== undefined) {
      this.tokens = Math.max(0, this.tokens - recipe.tokenCost);
    }

    // 3. Blueprints are NOT consumed -- they stay in inventory

    // 4. Send CraftItem
    this.callbacks.onAction({ CraftItem: { recipe_id: recipe.id } });

    // 5. Track as crafted locally
    this.craftedRecipes.add(recipe.id);

    // 6. Category-specific result actions
    switch (recipe.category) {
      case 'weapon':
        this.callbacks.onAction({ EquipWeapon: { weapon_id: recipe.result } });
        break;
      case 'armour':
        this.callbacks.onAction({ EquipArmor: { armor_id: recipe.result } });
        break;
      case 'upgrade':
        this.callbacks.onAction({ PurchaseUpgrade: { upgrade_id: recipe.result } });
        this.purchasedUpgrades.add(recipe.result);
        break;
      case 'app':
        this.callbacks.onAction({
          UnlockBuilding: { building_id: buildingTypeToId(recipe.result) },
        });
        break;
    }

    // 7. Re-render immediately so user sees the result
    this.renderCards();
  }

  private makeTabButton(label: string, active: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      padding: '10px 20px',
      fontSize: '13px',
      fontFamily: FONT,
      fontWeight: 'bold',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${gold}` : '2px solid transparent',
      color: active ? gold : '#666',
      cursor: 'pointer',
    });
    btn.textContent = label;
    return btn;
  }

  private setTabActive(btn: HTMLButtonElement, active: boolean): void {
    btn.style.borderBottom = active ? `2px solid ${gold}` : '2px solid transparent';
    btn.style.color = active ? gold : '#666';
  }
}
