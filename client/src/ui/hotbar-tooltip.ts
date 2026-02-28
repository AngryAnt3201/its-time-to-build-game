export class HotbarTooltip {
  private container: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private costEl: HTMLDivElement;
  private descEl: HTMLDivElement;
  private tierEl: HTMLDivElement;
  private statusEl: HTMLDivElement;

  visible = false;

  constructor() {
    // Create container div
    this.container = document.createElement('div');
    this.container.id = 'hotbar-tooltip';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 999;
      background: #1a1510;
      border: 1px solid #d4a017;
      border-radius: 4px;
      padding: 8px 12px;
      font-family: 'IBM Plex Mono', monospace;
      pointer-events: none;
      min-width: 180px;
      max-width: 260px;
      box-shadow: 0 0 12px rgba(212, 160, 23, 0.2);
    `;

    // Name (gold, bold, 13px)
    this.nameEl = document.createElement('div');
    this.nameEl.style.cssText = 'color: #d4a017; font-size: 13px; font-weight: bold; margin-bottom: 2px;';

    // Cost (muted, 11px)
    this.costEl = document.createElement('div');
    this.costEl.style.cssText = 'color: #8a8a6a; font-size: 11px; margin-bottom: 4px;';

    // Description (italic, 10px)
    this.descEl = document.createElement('div');
    this.descEl.style.cssText = 'color: #9a9a7a; font-size: 10px; font-style: italic; margin-bottom: 4px;';

    // Tier label (dim, 9px)
    this.tierEl = document.createElement('div');
    this.tierEl.style.cssText = 'color: #6a5a3a; font-size: 9px; margin-bottom: 2px;';

    // Status (colored, 9px)
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size: 9px;';

    this.container.appendChild(this.nameEl);
    this.container.appendChild(this.costEl);
    this.container.appendChild(this.descEl);
    this.container.appendChild(this.tierEl);
    this.container.appendChild(this.statusEl);

    document.body.appendChild(this.container);
  }

  /** Show tooltip at screen position with building info. */
  show(screenX: number, screenY: number, name: string, cost: number, description: string, tierLabel: string, status: string) {
    this.nameEl.textContent = name;
    this.costEl.textContent = `${cost} tokens`;
    this.descEl.textContent = description;
    this.tierEl.textContent = tierLabel;

    // Status with color coding
    if (status === 'Locked') {
      this.statusEl.textContent = 'Locked';
      this.statusEl.style.color = '#8b4444';
    } else if (status === 'Built') {
      this.statusEl.textContent = 'Already Built';
      this.statusEl.style.color = '#6b8b6b';
    } else {
      this.statusEl.textContent = 'Available';
      this.statusEl.style.color = '#d4a017';
    }

    // Show first to get dimensions, then position
    this.container.style.display = 'block';
    const rect = this.container.getBoundingClientRect();
    this.container.style.left = `${screenX - rect.width / 2}px`;
    this.container.style.top = `${screenY - rect.height - 8}px`;

    this.visible = true;
  }

  /** Hide the tooltip. */
  hide() {
    this.container.style.display = 'none';
    this.visible = false;
  }

  destroy() {
    this.container.remove();
  }
}
