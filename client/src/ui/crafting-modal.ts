import type { PlayerAction } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = "'IBM Plex Mono', monospace";
const gold = '#d4a017';
const darkBg = '#1a1a1a';
const panelBg = '#2a2a1a';

// ── CraftingModal ────────────────────────────────────────────────────

export interface CraftingModalCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class CraftingModal {
  visible = false;

  private readonly container: HTMLDivElement;
  private readonly craftingTab: HTMLButtonElement;
  private readonly upgradesTab: HTMLButtonElement;
  private readonly craftingContent: HTMLDivElement;
  private readonly upgradesContent: HTMLDivElement;
  private readonly callbacks: CraftingModalCallbacks;

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
      width: '450px',
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
      borderBottom: `1px solid #3a3020`,
    });

    this.craftingTab = this.makeTabButton('Crafting', true);
    this.upgradesTab = this.makeTabButton('Upgrades', false);

    this.craftingTab.addEventListener('click', () => this.switchTab('crafting'));
    this.upgradesTab.addEventListener('click', () => this.switchTab('upgrades'));

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

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

    header.appendChild(this.craftingTab);
    header.appendChild(this.upgradesTab);
    header.appendChild(spacer);
    header.appendChild(closeBtn);

    // ── Crafting tab content ─────────────────────────────────────
    this.craftingContent = document.createElement('div');
    Object.assign(this.craftingContent.style, {
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '16px',
      background: panelBg,
    });

    // 4x2 grid of empty slots
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 56px)',
      gridTemplateRows: 'repeat(2, 56px)',
      gap: '8px',
    });

    for (let i = 0; i < 8; i++) {
      const slot = document.createElement('div');
      Object.assign(slot.style, {
        width: '56px',
        height: '56px',
        background: '#111',
        border: '1px solid #3a3020',
        borderRadius: '4px',
      });
      grid.appendChild(slot);
    }

    const comingSoon = document.createElement('p');
    Object.assign(comingSoon.style, {
      margin: '0',
      fontSize: '13px',
      color: '#666',
      fontFamily: FONT,
      fontStyle: 'italic',
    });
    comingSoon.textContent = 'Crafting coming soon...';

    this.craftingContent.appendChild(grid);
    this.craftingContent.appendChild(comingSoon);

    // ── Upgrades tab content ─────────────────────────────────────
    this.upgradesContent = document.createElement('div');
    Object.assign(this.upgradesContent.style, {
      padding: '40px 20px',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: panelBg,
    });

    const upgradeText = document.createElement('p');
    Object.assign(upgradeText.style, {
      margin: '0',
      fontSize: '14px',
      color: '#666',
      fontFamily: FONT,
      fontStyle: 'italic',
      textAlign: 'center',
    });
    upgradeText.textContent = 'Upgrade Tree \u2014 Coming Soon';

    this.upgradesContent.appendChild(upgradeText);

    // ── Assemble ─────────────────────────────────────────────────
    this.container.appendChild(header);
    this.container.appendChild(this.craftingContent);
    this.container.appendChild(this.upgradesContent);

    document.body.appendChild(this.container);
  }

  // ── Public API ──────────────────────────────────────────────────

  open(): void {
    this.container.style.display = 'flex';
    this.visible = true;
    this.switchTab('crafting');
  }

  close(): void {
    this.container.style.display = 'none';
    this.visible = false;
    this.callbacks.onClose();
  }

  // ── Private helpers ─────────────────────────────────────────────

  private switchTab(tab: 'crafting' | 'upgrades'): void {
    if (tab === 'crafting') {
      this.craftingContent.style.display = 'flex';
      this.upgradesContent.style.display = 'none';
      this.setTabActive(this.craftingTab, true);
      this.setTabActive(this.upgradesTab, false);
    } else {
      this.craftingContent.style.display = 'none';
      this.upgradesContent.style.display = 'flex';
      this.setTabActive(this.craftingTab, false);
      this.setTabActive(this.upgradesTab, true);
    }
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
