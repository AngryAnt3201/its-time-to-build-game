import type { PlayerAction } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = "'IBM Plex Mono', monospace";

const COLORS = {
  gold: '#d4a017',
  mutedGold: '#c8b06b',
  sicklyGreen: '#6b8b6b',
  crimson: '#8b4444',
  darkBg: '#1a1a1a',
  panelBg: '#2a2a1a',
  headerBorder: '#3a3020',
  statusGrey: '#666666',
  statusGreen: '#44cc66',
  statusBrightGreen: '#66ff88',
  statusRed: '#cc4444',
  buttonBg: '#2a2418',
  buttonBgHover: '#3a3020',
  white: '#e0d8c0',
} as const;

// ── BuildingPanel ────────────────────────────────────────────────────

export interface BuildingPanelCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class BuildingPanel {
  /** Whether the panel is currently visible. */
  visible = false;

  private readonly container: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly statusBadge: HTMLSpanElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private readonly descriptionEl: HTMLParagraphElement;
  private readonly iframe: HTMLIFrameElement;

  private readonly callbacks: BuildingPanelCallbacks;

  private _currentBuildingId: string | null = null;
  private currentPort: number | null = null;
  private loadedIframeSrc: string = 'about:blank';

  /** The building ID currently displayed in the panel (null when closed). */
  get currentBuildingId(): string | null {
    return this._currentBuildingId;
  }

  constructor(callbacks: BuildingPanelCallbacks) {
    this.callbacks = callbacks;

    // ── Container ─────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'building-panel';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '80vw',
      height: '80vh',
      maxWidth: '1200px',
      maxHeight: '900px',
      background: COLORS.darkBg,
      border: `2px solid ${COLORS.gold}`,
      borderRadius: '8px',
      boxShadow: `0 0 40px rgba(0,0,0,0.8), 0 0 8px ${COLORS.gold}33`,
      zIndex: '1000',
      display: 'none',
      flexDirection: 'column',
      fontFamily: FONT,
      color: COLORS.mutedGold,
      overflow: 'hidden',
    });

    // ── Header bar ────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderBottom: `1px solid ${COLORS.headerBorder}`,
      flexShrink: '0',
    });

    // Title
    this.titleEl = document.createElement('h2');
    Object.assign(this.titleEl.style, {
      margin: '0',
      fontSize: '18px',
      fontWeight: 'bold',
      color: COLORS.gold,
      fontFamily: FONT,
      flex: '1',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    this.titleEl.textContent = 'Building';

    // Status badge
    this.statusBadge = document.createElement('span');
    Object.assign(this.statusBadge.style, {
      padding: '2px 10px',
      borderRadius: '4px',
      fontSize: '11px',
      fontFamily: FONT,
      fontWeight: 'bold',
      whiteSpace: 'nowrap',
    });

    // Toggle button (Start / Stop)
    this.toggleBtn = document.createElement('button');
    this.applyButtonStyle(this.toggleBtn, false);
    this.toggleBtn.textContent = 'Start';
    this.toggleBtn.addEventListener('click', () => this.handleToggle());

    // Close button
    this.closeBtn = document.createElement('button');
    this.applyButtonStyle(this.closeBtn, true);
    this.closeBtn.textContent = 'Close';
    this.closeBtn.addEventListener('click', () => this.close());

    header.appendChild(this.titleEl);
    header.appendChild(this.statusBadge);
    header.appendChild(this.toggleBtn);
    header.appendChild(this.closeBtn);

    // ── Description ───────────────────────────────────────────────
    this.descriptionEl = document.createElement('p');
    Object.assign(this.descriptionEl.style, {
      margin: '0',
      padding: '8px 16px',
      fontSize: '12px',
      fontFamily: FONT,
      color: COLORS.mutedGold,
      opacity: '0.7',
      borderBottom: `1px solid ${COLORS.headerBorder}`,
      flexShrink: '0',
    });

    // ── Iframe ────────────────────────────────────────────────────
    this.iframe = document.createElement('iframe');
    Object.assign(this.iframe.style, {
      flex: '1',
      border: 'none',
      background: '#000000',
      width: '100%',
      minHeight: '0',
    });
    this.iframe.src = 'about:blank';
    // No sandbox — these are local Vite dev servers, not untrusted content.

    // ── Assemble ──────────────────────────────────────────────────
    this.container.appendChild(header);
    this.container.appendChild(this.descriptionEl);
    this.container.appendChild(this.iframe);

    document.body.appendChild(this.container);
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Show the panel for a building.
   * @param status One of: "NotInitialized", "Ready", "Running:PORT", "Error:MSG"
   */
  open(buildingId: string, name: string, description: string, status: string): void {
    this._currentBuildingId = buildingId;
    this.currentPort = null;
    // Reset iframe so the previous building's app doesn't bleed through
    this.iframe.src = 'about:blank';
    this.loadedIframeSrc = 'about:blank';
    this.titleEl.textContent = name;
    this.descriptionEl.textContent = description;
    this.updateStatus(status);
    this.container.style.display = 'flex';
    this.visible = true;
  }

  /** Hide the panel, clear iframe, invoke onClose callback. */
  close(): void {
    this.container.style.display = 'none';
    this.visible = false;
    this.iframe.src = 'about:blank';
    this.loadedIframeSrc = 'about:blank';
    this._currentBuildingId = null;
    this.currentPort = null;
    this.callbacks.onClose();
  }

  /**
   * Update the displayed status. Parse the status string:
   *  - "NotInitialized" -- grey badge, Start button disabled
   *  - "Ready"          -- green badge, Start button enabled
   *  - "Running:PORT"   -- bright green badge showing ":PORT", Stop button, iframe loads localhost
   *  - "Error:MSG"      -- red badge, Start button enabled
   */
  updateStatus(status: string): void {
    this.currentPort = null;

    if (status === 'NotInitialized') {
      this.setStatusBadge('Not Initialized', COLORS.statusGrey, '#222222');
      this.setToggleButton('Start', true);
    } else if (status === 'Ready') {
      this.setStatusBadge('Ready', COLORS.statusGreen, '#1a2e1a');
      this.setToggleButton('Start', false);
    } else if (status.startsWith('Running:')) {
      const port = status.slice('Running:'.length);
      const portNum = parseInt(port, 10);
      this.currentPort = isNaN(portNum) ? null : portNum;

      this.setStatusBadge(`:${port}`, COLORS.statusBrightGreen, '#1a3a1a');
      this.setToggleButton('Stop', false);

      // Only set iframe src when the URL actually changes — this method is
      // called every tick (20Hz), and re-setting src triggers a full reload.
      if (this.currentPort !== null) {
        const url = `http://localhost:${this.currentPort}`;
        if (this.loadedIframeSrc !== url) {
          this.iframe.src = url;
          this.loadedIframeSrc = url;
        }
      }
    } else if (status.startsWith('Error:')) {
      const msg = status.slice('Error:'.length);
      this.setStatusBadge(`Error: ${msg}`, COLORS.statusRed, '#2e1a1a');
      this.setToggleButton('Start', false);
    } else {
      // Unknown status -- show as grey
      this.setStatusBadge(status, COLORS.statusGrey, '#222222');
      this.setToggleButton('Start', true);
    }
  }

  /**
   * Handle keyboard input. Returns true if the key was consumed.
   */
  handleKey(key: string): boolean {
    if (!this.visible) return false;
    if (key === 'Escape') {
      this.close();
      return true;
    }
    return false;
  }

  // ── Private helpers ─────────────────────────────────────────────

  private setStatusBadge(text: string, color: string, bgColor: string): void {
    this.statusBadge.textContent = text;
    this.statusBadge.style.color = color;
    this.statusBadge.style.background = bgColor;
    this.statusBadge.style.border = `1px solid ${color}44`;
  }

  private setToggleButton(label: string, disabled: boolean): void {
    this.toggleBtn.textContent = label;
    this.toggleBtn.disabled = disabled;
    this.toggleBtn.style.opacity = disabled ? '0.4' : '1';
    this.toggleBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }

  private handleToggle(): void {
    if (!this.currentBuildingId) return;

    if (this.currentPort !== null) {
      // Server is running -- send stop
      this.callbacks.onAction({ StopDevServer: { building_id: this.currentBuildingId } });
    } else {
      // Server is not running -- send start
      this.callbacks.onAction({ StartDevServer: { building_id: this.currentBuildingId } });
    }
  }

  private applyButtonStyle(btn: HTMLButtonElement, isCrimson: boolean): void {
    const borderColor = isCrimson ? COLORS.crimson : COLORS.gold;
    const textColor = isCrimson ? COLORS.crimson : COLORS.gold;

    Object.assign(btn.style, {
      padding: '4px 14px',
      fontSize: '12px',
      fontFamily: FONT,
      fontWeight: 'bold',
      background: COLORS.buttonBg,
      color: textColor,
      border: `1px solid ${borderColor}`,
      borderRadius: '4px',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = COLORS.buttonBgHover;
      btn.style.borderColor = textColor;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = COLORS.buttonBg;
      btn.style.borderColor = borderColor;
    });
  }
}
