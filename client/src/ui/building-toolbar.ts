export interface BuildingToolbarCallbacks {
  onAssignAgent: (buildingId: string, agentId: number) => void;
  onUnassignAgent: (buildingId: string, agentId: number) => void;
  onOpenApp: (buildingId: string) => void;
}

export interface IdleAgent {
  id: number;
  name: string;
  tier: string;
}

export interface AssignedAgent {
  id: number;
  name: string;
  tier: string;
}

const MAX_SLOTS = 3;

const TIER_ICONS: Record<string, string> = {
  Apprentice: 'agent_1.png',
  Journeyman: 'agent_2.png',
  Artisan: 'agent_3.png',
  Architect: 'agent_4.png',
};

export class BuildingToolbar {
  private container: HTMLDivElement;
  private nameEl: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private starsEl: HTMLSpanElement;
  private descEl: HTMLDivElement;
  private noPylonEl: HTMLDivElement;
  private slotsEl: HTMLDivElement;
  private openAppBtn: HTMLButtonElement;
  private pickerEl: HTMLDivElement;
  private callbacks: BuildingToolbarCallbacks;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private idleAgents: IdleAgent[] = [];
  private pickerOpen = false;

  visible = false;
  currentBuildingId = '';

  constructor(callbacks: BuildingToolbarCallbacks) {
    this.callbacks = callbacks;

    // Root container — pointer-events: none so it doesn't block canvas hover detection.
    // Interactive children re-enable pointer-events.
    this.container = document.createElement('div');
    this.container.id = 'building-toolbar';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1001;
      background: #1a1510;
      border: 1px solid #d4a017;
      border-radius: 6px;
      padding: 8px 12px;
      font-family: 'IBM Plex Mono', monospace;
      pointer-events: none;
      min-width: 200px;
      box-shadow: 0 0 16px rgba(212, 160, 23, 0.25);
      transform: translateX(-50%);
    `;

    // Header row (name + status badge)
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

    this.nameEl = document.createElement('span');
    this.nameEl.style.cssText = 'color: #d4a017; font-size: 12px; font-weight: bold;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'font-size: 9px; padding: 1px 6px; border-radius: 3px;';

    this.starsEl = document.createElement('span');
    this.starsEl.style.cssText = 'font-size: 10px; color: #d4a017; display: none;';

    header.appendChild(this.nameEl);
    header.appendChild(this.statusEl);
    header.appendChild(this.starsEl);

    // Description line (for passive buildings)
    this.descEl = document.createElement('div');
    this.descEl.style.cssText = 'display: none; color: #8a7a5a; font-size: 10px; margin-bottom: 6px; line-height: 1.3;';

    // No-pylon warning
    this.noPylonEl = document.createElement('div');
    this.noPylonEl.style.cssText = 'display: none; color: #aa6633; font-size: 9px; margin-bottom: 6px; line-height: 1.3;';
    this.noPylonEl.innerHTML = '\u26a0 <span style="color:#aa6633;">No Pylon nearby \u2014 terminal hidden</span>';

    // Agent slots row
    this.slotsEl = document.createElement('div');
    this.slotsEl.style.cssText = 'display: flex; gap: 4px; margin-bottom: 6px;';

    // Agent picker dropdown (hidden by default)
    this.pickerEl = document.createElement('div');
    this.pickerEl.style.cssText = `
      display: none;
      background: #12100c;
      border: 1px solid #d4a017;
      border-radius: 4px;
      margin-bottom: 6px;
      max-height: 120px;
      overflow-y: auto;
      pointer-events: auto;
    `;

    // Open App button
    this.openAppBtn = document.createElement('button');
    this.openAppBtn.textContent = 'Open App';
    this.openAppBtn.style.cssText = `
      width: 100%;
      padding: 4px 0;
      background: transparent;
      border: 1px solid #d4a017;
      border-radius: 3px;
      color: #d4a017;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 10px;
      cursor: pointer;
      pointer-events: auto;
    `;
    this.openAppBtn.addEventListener('click', () => {
      if (this.currentBuildingId) {
        this.callbacks.onOpenApp(this.currentBuildingId);
      }
    });

    this.container.appendChild(header);
    this.container.appendChild(this.descEl);
    this.container.appendChild(this.noPylonEl);
    this.container.appendChild(this.slotsEl);
    this.container.appendChild(this.pickerEl);
    this.container.appendChild(this.openAppBtn);

    document.body.appendChild(this.container);
  }

  /** Provide the current list of idle agents so the picker can show them. */
  setIdleAgents(agents: IdleAgent[]) {
    this.idleAgents = agents;
  }

  show(buildingId: string, name: string, status: string, assignedAgents: AssignedAgent[], opts?: { description?: string; noPylon?: boolean }) {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.currentBuildingId = buildingId;
    this.nameEl.textContent = name;
    this.updateStatusBadge(status);

    if (opts?.description) {
      // Passive building — show description, hide agents & open app
      this.descEl.textContent = opts.description;
      this.descEl.style.display = 'block';
      this.noPylonEl.style.display = 'none';
      this.slotsEl.style.display = 'none';
      this.openAppBtn.style.display = 'none';
      this.closePicker();
    } else {
      // Normal building — show agents & open app, hide description
      this.descEl.style.display = 'none';
      this.noPylonEl.style.display = opts?.noPylon ? 'block' : 'none';
      this.updateSlots(assignedAgents);
      this.slotsEl.style.display = 'flex';
      this.openAppBtn.style.display = 'block';
    }

    this.container.style.display = 'block';
    this.visible = true;
  }

  updatePosition(screenX: number, screenY: number) {
    this.container.style.left = `${screenX}px`;
    this.container.style.top = `${screenY}px`;
  }

  hide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.closePicker();
    this.container.style.display = 'none';
    this.visible = false;
    this.currentBuildingId = '';
  }

  scheduleHide() {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, 300);
  }

  cancelScheduledHide() {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private openPicker() {
    this.pickerEl.innerHTML = '';

    if (this.idleAgents.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding: 6px 8px; color: #666; font-size: 10px; font-style: italic; pointer-events: none;';
      empty.textContent = 'No idle agents';
      this.pickerEl.appendChild(empty);
    } else {
      for (const agent of this.idleAgents) {
        const row = document.createElement('div');
        row.style.cssText = `
          padding: 4px 8px;
          color: #d4a017;
          font-size: 10px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          pointer-events: auto;
        `;
        row.addEventListener('mouseenter', () => { row.style.background = '#2a2418'; });
        row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });

        const icon = document.createElement('img');
        icon.src = `/icons/agents/${TIER_ICONS[agent.tier] ?? 'agent_1.png'}`;
        icon.style.cssText = 'width: 14px; height: 14px; image-rendering: pixelated;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = agent.name;
        nameSpan.style.fontWeight = 'bold';

        const tierSpan = document.createElement('span');
        tierSpan.textContent = agent.tier;
        tierSpan.style.cssText = 'color: #6a5a3a; font-size: 9px;';

        row.appendChild(icon);
        row.appendChild(nameSpan);
        row.appendChild(tierSpan);

        row.addEventListener('click', () => {
          this.callbacks.onAssignAgent(this.currentBuildingId, agent.id);
          this.closePicker();
        });

        this.pickerEl.appendChild(row);
      }
    }

    this.pickerEl.style.display = 'block';
    this.pickerOpen = true;
  }

  private closePicker() {
    this.pickerEl.style.display = 'none';
    this.pickerOpen = false;
  }

  private updateStatusBadge(status: string) {
    if (status === 'NotInitialized') {
      this.statusEl.textContent = 'Not Init';
      this.statusEl.style.background = '#333';
      this.statusEl.style.color = '#888';
    } else if (status === 'Ready') {
      this.statusEl.textContent = 'Ready';
      this.statusEl.style.background = '#1a2e1a';
      this.statusEl.style.color = '#4a8';
    } else if (status.startsWith('Running:')) {
      this.statusEl.textContent = 'Running';
      this.statusEl.style.background = '#1a3e1a';
      this.statusEl.style.color = '#4c4';
    } else if (status.startsWith('Error:')) {
      this.statusEl.textContent = 'Error';
      this.statusEl.style.background = '#2e1a1a';
      this.statusEl.style.color = '#c44';
    } else {
      this.statusEl.textContent = status;
      this.statusEl.style.background = '#333';
      this.statusEl.style.color = '#888';
    }
  }

  updateStars(stars: number | null): void {
    if (stars === null || stars === undefined) {
      this.starsEl.style.display = 'none';
      return;
    }
    this.starsEl.style.display = 'inline';
    let text = '';
    for (let i = 1; i <= 6; i++) {
      text += i <= stars ? '\u2605' : '\u2606';
    }
    this.starsEl.textContent = text;
  }

  private updateSlots(assignedAgents: AssignedAgent[]) {
    this.slotsEl.innerHTML = '';

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.style.cssText = `
        width: 56px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        font-size: 10px;
        user-select: none;
        pointer-events: auto;
      `;

      if (i < assignedAgents.length) {
        // Assigned agent slot — green with tier icon, click to unassign
        const agent = assignedAgents[i];
        slot.style.background = '#1a2e1a';
        slot.style.border = '1px solid #4a8';
        slot.style.color = '#4a8';
        slot.style.cursor = 'pointer';
        slot.style.gap = '4px';
        slot.title = `Click to unassign ${agent.name}`;

        const icon = document.createElement('img');
        icon.src = `/icons/agents/${TIER_ICONS[agent.tier] ?? 'agent_1.png'}`;
        icon.style.cssText = 'width: 14px; height: 14px; image-rendering: pixelated;';
        slot.appendChild(icon);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = agent.name;
        slot.appendChild(nameSpan);

        slot.addEventListener('click', () => {
          this.callbacks.onUnassignAgent(this.currentBuildingId, agent.id);
        });
      } else if (i === assignedAgents.length) {
        // Next available slot — gold dashed, click to open picker
        slot.textContent = '+';
        slot.style.background = 'transparent';
        slot.style.border = '1px dashed #d4a017';
        slot.style.color = '#d4a017';
        slot.style.cursor = 'pointer';
        slot.title = 'Assign an agent';
        slot.addEventListener('click', () => {
          if (this.pickerOpen) {
            this.closePicker();
          } else {
            this.openPicker();
          }
        });
      } else {
        // Empty greyed-out slot
        slot.textContent = '';
        slot.style.background = '#111';
        slot.style.border = '1px solid #333';
        slot.style.color = '#333';
        slot.style.cursor = 'default';
        slot.style.pointerEvents = 'none';
      }

      this.slotsEl.appendChild(slot);
    }

    // Close the picker if all slots filled
    if (assignedAgents.length >= MAX_SLOTS && this.pickerOpen) {
      this.closePicker();
    }
  }

  destroy() {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.container.remove();
  }
}
