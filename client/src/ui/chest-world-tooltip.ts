const CHEST_NAMES = [
  'Forgotten Cache',
  'Dusty Strongbox',
  'Rusted Coffer',
  'Glimmering Stash',
  'Ancient Lockbox',
  'Scrap Chest',
  'Token Hoard',
  'Lost Supply Crate',
  'Wanderer\'s Chest',
  'Buried Trove',
  'Relic Container',
  'Corroded Vault',
];

const CHEST_DESCS = [
  'Faint energy pulses from within.',
  'Something rattles inside.',
  'The lock has long since rusted away.',
  'A warm golden glow seeps through the cracks.',
  'Smells faintly of iron and old parchment.',
  'Covered in moss and scratches.',
  'The hinges creak with anticipation.',
  'Marked with an unknown sigil.',
];

function chestHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >> 13), 1274126177);
  return (h ^ (h >> 16)) >>> 0;
}

export interface ChestTooltipCallbacks {
  onOpenChest: (wx: number, wy: number) => void;
  /** Return the <canvas> or <img> element for a chest's closed sprite. */
  getChestIcon?: (wx: number, wy: number) => HTMLCanvasElement | null;
}

export class ChestWorldTooltip {
  private container: HTMLDivElement;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private callbacks: ChestTooltipCallbacks;

  visible = false;
  currentChestKey: string | null = null;
  private currentWx = 0;
  private currentWy = 0;

  constructor(callbacks: ChestTooltipCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'chest-world-tooltip';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1050;
      background: #0d0b08;
      border: 1px solid #5a4a20;
      border-radius: 4px;
      padding: 10px 12px;
      font-family: 'IBM Plex Mono', monospace;
      pointer-events: auto;
      min-width: 180px;
      max-width: 220px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7), 0 0 12px rgba(212, 160, 23, 0.15);
      cursor: pointer;
    `;

    this.container.addEventListener('mouseenter', () => this.cancelScheduledHide());
    this.container.addEventListener('mouseleave', () => this.scheduleHide());
    this.container.addEventListener('click', () => {
      this.callbacks.onOpenChest(this.currentWx, this.currentWy);
      this.hide();
    });

    document.body.appendChild(this.container);
  }

  show(wx: number, wy: number, screenX: number, screenY: number): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    const key = `${wx},${wy}`;
    this.currentChestKey = key;
    this.currentWx = wx;
    this.currentWy = wy;
    this.container.innerHTML = '';

    // Deterministic name & description from chest position
    const nameIdx = chestHash(wx, wy, 99999) % CHEST_NAMES.length;
    const descIdx = chestHash(wx, wy, 88888) % CHEST_DESCS.length;

    // Header: icon + name
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
      width: 32px; height: 32px;
      border-radius: 4px;
      border: 2px solid #d4a017;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      background: rgba(212, 160, 23, 0.08);
    `;
    const chestIcon = this.callbacks.getChestIcon?.(wx, wy);
    if (chestIcon) {
      chestIcon.style.cssText = 'width: 24px; height: 24px; image-rendering: pixelated;';
      iconWrap.appendChild(chestIcon);
    } else {
      const icon = document.createElement('img');
      icon.src = '/chests/RPG Chests.png';
      icon.style.cssText = 'width: 24px; height: 24px; image-rendering: pixelated;';
      iconWrap.appendChild(icon);
    }

    const nameEl = document.createElement('div');
    nameEl.textContent = CHEST_NAMES[nameIdx];
    nameEl.style.cssText = 'color: #d4a017; font-size: 12px; font-weight: bold;';

    header.appendChild(iconWrap);
    header.appendChild(nameEl);
    this.container.appendChild(header);

    // Description
    const descEl = document.createElement('div');
    descEl.textContent = CHEST_DESCS[descIdx];
    descEl.style.cssText = 'color: #8a7a5a; font-size: 10px; font-style: italic; margin-bottom: 8px; line-height: 1.3;';
    this.container.appendChild(descEl);

    // "Click to open" hint
    const hintEl = document.createElement('div');
    hintEl.textContent = '\u25b6 Click to open';
    hintEl.style.cssText = `
      color: #9a8a4a;
      font-size: 9px;
      text-align: center;
      padding: 4px 0;
      border-top: 1px solid #2a2010;
    `;
    this.container.appendChild(hintEl);

    // Position
    this.container.style.left = `${screenX + 16}px`;
    this.container.style.top = `${screenY - 20}px`;
    this.container.style.display = 'block';
    this.visible = true;

    requestAnimationFrame(() => {
      const rect = this.container.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.container.style.left = `${screenX - rect.width - 8}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.container.style.top = `${window.innerHeight - rect.height - 8}px`;
      }
    });
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.container.style.display = 'none';
    this.visible = false;
    this.currentChestKey = null;
  }

  scheduleHide(): void {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, 300);
  }

  cancelScheduledHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.container.remove();
  }
}
