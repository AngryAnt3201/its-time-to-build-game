export interface AgentWorldTooltipCallbacks {
  onOpenTerminal: (agentId: number, buildingId: string, agentName: string, buildingName: string) => void;
  onReviveAgent?: (agentId: number) => void;
}

const TIER_ICONS: Record<string, string> = {
  Apprentice: 'agent_1.png',
  Journeyman: 'agent_2.png',
  Artisan: 'agent_3.png',
  Architect: 'agent_4.png',
};

const TIER_MODEL_NAMES: Record<string, string> = {
  Apprentice: 'Ministral 3B',
  Journeyman: 'Ministral 8B',
  Artisan: 'Codestral',
  Architect: 'Devstral 2',
};

const STATE_COLORS: Record<string, string> = {
  Idle: '#ccaa44',
  Walking: '#aacc44',
  Building: '#44cc66',
  Erroring: '#ff6644',
  Exploring: '#6688cc',
  Defending: '#cc4444',
  Critical: '#ff0000',
  Unresponsive: '#333333',
};

const TIER_COLORS: Record<string, string> = {
  Apprentice: '#6a6a5a',
  Journeyman: '#4a8a4a',
  Artisan: '#6a6acc',
  Architect: '#d4a017',
};

export interface AgentWorldData {
  id: number;
  name: string;
  tier: string;
  state: string;
  health_pct: number;
  morale_pct: number;
  stars: number;
  turns_used: number;
  max_turns: number;
  model_lore_name: string;
  xp: number;
  level: number;
  bound?: boolean;
  recruitable_cost?: number | null;
}

const REVIVAL_COSTS: Record<string, number> = {
  Apprentice: 15,
  Journeyman: 45,
  Artisan: 120,
  Architect: 300,
};

const RECRUIT_COSTS: Record<string, number> = {
  Apprentice: 20,
  Journeyman: 60,
  Artisan: 150,
  Architect: 400,
};

export class AgentWorldTooltip {
  private container: HTMLDivElement;
  private callbacks: AgentWorldTooltipCallbacks;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  visible = false;
  currentAgentId: number | null = null;

  /** The building context for the current agent (set externally). */
  private buildingId = '';
  private buildingName = '';

  constructor(callbacks: AgentWorldTooltipCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'agent-world-tooltip';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1050;
      background: #0d0b08;
      border: 1px solid #3a3020;
      border-radius: 4px;
      padding: 10px 12px;
      font-family: 'IBM Plex Mono', monospace;
      pointer-events: auto;
      min-width: 220px;
      max-width: 240px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
    `;

    this.container.addEventListener('mouseenter', () => this.cancelScheduledHide());
    this.container.addEventListener('mouseleave', () => this.scheduleHide());

    document.body.appendChild(this.container);
  }

  show(agent: AgentWorldData, screenX: number, screenY: number, buildingId: string, buildingName: string, noPylon?: boolean): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.currentAgentId = agent.id;
    this.buildingId = buildingId;
    this.buildingName = buildingName;
    this.container.innerHTML = '';

    const tierColor = TIER_COLORS[agent.tier] ?? '#6a6a5a';
    const stateColor = STATE_COLORS[agent.state] ?? '#9a9a8a';
    const isDead = agent.state === 'Unresponsive';

    // Header row: icon + name + stars
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = `
      width: 36px; height: 36px;
      border-radius: 50%;
      border: 2px solid ${tierColor};
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    `;
    const icon = document.createElement('img');
    icon.src = `/icons/agents/${TIER_ICONS[agent.tier] ?? 'agent_1.png'}`;
    icon.style.cssText = 'width: 28px; height: 28px; image-rendering: pixelated;';
    iconWrap.appendChild(icon);

    const nameCol = document.createElement('div');
    nameCol.style.cssText = 'flex: 1; min-width: 0;';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display: flex; align-items: center; gap: 6px;';

    const nameEl = document.createElement('span');
    nameEl.textContent = agent.name;
    nameEl.style.cssText = `color: ${isDead ? '#444' : '#d4a017'}; font-size: 12px; font-weight: bold;`;

    const starsEl = document.createElement('span');
    starsEl.textContent = '\u2605'.repeat(agent.stars) + '\u2606'.repeat(3 - agent.stars);
    starsEl.style.cssText = 'color: #d4a017; font-size: 10px;';

    nameRow.appendChild(nameEl);
    nameRow.appendChild(starsEl);

    const loreEl = document.createElement('div');
    loreEl.textContent = `\u201c${agent.model_lore_name}\u201d`;
    loreEl.style.cssText = 'color: #8a7a5a; font-size: 10px; font-style: italic; margin-top: 1px;';

    nameCol.appendChild(nameRow);
    nameCol.appendChild(loreEl);
    header.appendChild(iconWrap);
    header.appendChild(nameCol);
    this.container.appendChild(header);

    // Model + tier line
    const modelEl = document.createElement('div');
    modelEl.textContent = `${TIER_MODEL_NAMES[agent.tier] ?? agent.tier}  \u00b7  ${agent.tier}`;
    modelEl.style.cssText = 'color: #6a6a5a; font-size: 9px; margin-bottom: 6px;';
    this.container.appendChild(modelEl);

    // Bound agent indicator
    if (agent.bound) {
      const boundEl = document.createElement('div');
      boundEl.innerHTML = '<span style="color: #00ccff; font-weight: bold;">BOUND AGENT</span> \u2014 Camp Guardian';
      boundEl.style.cssText = 'color: #5a8a9a; font-size: 9px; margin-bottom: 4px; padding: 2px 4px; background: rgba(0, 204, 255, 0.08); border: 1px solid rgba(0, 204, 255, 0.2); border-radius: 2px;';
      this.container.appendChild(boundEl);
    }

    // State line
    const stateEl = document.createElement('div');
    stateEl.innerHTML = `State: <span style="color: ${stateColor}; font-weight: bold;">${isDead ? 'DEAD' : agent.state}</span>`;
    stateEl.style.cssText = 'color: #9a9a8a; font-size: 9px; margin-bottom: 3px;';
    this.container.appendChild(stateEl);

    // Stats: health + tier
    const statsEl = document.createElement('div');
    statsEl.textContent = `Health: ${Math.round(agent.health_pct * 100)}%  \u00b7  Tier: ${agent.tier}`;
    statsEl.style.cssText = 'color: #6a8a6a; font-size: 9px; margin-bottom: 3px;';
    this.container.appendChild(statsEl);

    // Morale bar
    const moralePct = Math.round(agent.morale_pct * 100);
    const moraleRow = document.createElement('div');
    moraleRow.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 3px;';

    const moraleLabel = document.createElement('span');
    moraleLabel.textContent = 'Morale:';
    moraleLabel.style.cssText = 'color: #5a5a4a; font-size: 9px; width: 42px;';

    const moraleBarBg = document.createElement('div');
    moraleBarBg.style.cssText = 'flex: 1; height: 6px; background: #1a1210; border-radius: 2px; overflow: hidden;';

    const moraleBarFill = document.createElement('div');
    moraleBarFill.style.cssText = `height: 100%; width: ${moralePct}%; background: ${moralePct < 30 ? '#883333' : '#887733'}; border-radius: 2px;`;
    moraleBarBg.appendChild(moraleBarFill);

    const moralePctEl = document.createElement('span');
    moralePctEl.textContent = `${moralePct}%`;
    moralePctEl.style.cssText = 'color: #5a5a4a; font-size: 9px; width: 28px; text-align: right;';

    moraleRow.appendChild(moraleLabel);
    moraleRow.appendChild(moraleBarBg);
    moraleRow.appendChild(moralePctEl);
    this.container.appendChild(moraleRow);

    // Turns + XP
    const turnRatio = agent.max_turns > 0 ? agent.turns_used / agent.max_turns : 0;
    const turnColor = turnRatio > 0.8 ? '#aa3333' : '#5a5a4a';
    const turnsEl = document.createElement('div');
    turnsEl.textContent = `Turns: ${agent.turns_used}/${agent.max_turns}`;
    turnsEl.style.cssText = `color: ${turnColor}; font-size: 9px; margin-bottom: 2px;`;
    this.container.appendChild(turnsEl);

    const xpEl = document.createElement('div');
    xpEl.textContent = `XP: ${agent.xp}  Lv.${agent.level}`;
    xpEl.style.cssText = 'color: #5a5a4a; font-size: 9px; margin-bottom: 8px;';
    this.container.appendChild(xpEl);

    // Recruitment cost — show for bound/recruitable agents
    if (agent.bound && agent.recruitable_cost != null) {
      const costEl = document.createElement('div');
      costEl.innerHTML = `Cost: <span style="color: #d4a017; font-weight: bold;">${agent.recruitable_cost} tokens</span>`;
      costEl.style.cssText = 'color: #5a5a4a; font-size: 9px; margin-bottom: 6px; padding: 3px 4px; background: rgba(212, 160, 23, 0.06); border: 1px solid rgba(212, 160, 23, 0.15); border-radius: 2px;';
      this.container.appendChild(costEl);
    } else if (!agent.bound && agent.recruitable_cost != null) {
      // Dormant recruitable agent (not bound)
      const costEl = document.createElement('div');
      costEl.innerHTML = `Recruit: <span style="color: #d4a017; font-weight: bold;">${agent.recruitable_cost} tokens</span>`;
      costEl.style.cssText = 'color: #5a5a4a; font-size: 9px; margin-bottom: 6px; padding: 3px 4px; background: rgba(212, 160, 23, 0.06); border: 1px solid rgba(212, 160, 23, 0.15); border-radius: 2px;';
      this.container.appendChild(costEl);
    }

    // Revival cost — show for dead agents
    if (isDead) {
      const revivalCost = REVIVAL_COSTS[agent.tier] ?? 20;
      const revivalEl = document.createElement('div');
      revivalEl.innerHTML = `Revive: <span style="color: #44cc66; font-weight: bold;">${revivalCost} tokens</span>`;
      revivalEl.style.cssText = 'color: #5a5a4a; font-size: 9px; margin-bottom: 6px; padding: 3px 4px; background: rgba(68, 204, 102, 0.06); border: 1px solid rgba(68, 204, 102, 0.15); border-radius: 2px;';
      this.container.appendChild(revivalEl);

      // Revive button
      if (this.callbacks.onReviveAgent) {
        const btn = document.createElement('button');
        btn.textContent = '\u2764 Revive Agent';
        btn.style.cssText = `
          width: 100%;
          padding: 5px 0;
          background: transparent;
          border: 1px solid #44cc66;
          border-radius: 3px;
          color: #44cc66;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          cursor: pointer;
          margin-bottom: 4px;
        `;
        btn.addEventListener('mouseenter', () => {
          btn.style.background = '#1a2e1a';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'transparent';
        });
        btn.addEventListener('click', () => {
          this.callbacks.onReviveAgent!(agent.id);
          this.hide();
        });
        this.container.appendChild(btn);
      }
    }

    // No-pylon warning — show when assigned to a building without pylon coverage
    if (noPylon && buildingId) {
      const noPylonEl = document.createElement('div');
      noPylonEl.style.cssText = 'color: #aa6633; font-size: 9px; margin-bottom: 6px; line-height: 1.3;';
      noPylonEl.innerHTML = '\u26a0 No Pylon nearby \u2014 terminal will auto-close';
      this.container.appendChild(noPylonEl);
    }

    // "Open Terminal" button — only if agent is Building
    if (agent.state === 'Building') {
      const btn = document.createElement('button');
      btn.textContent = '\u25b6 Open Terminal';
      btn.style.cssText = `
        width: 100%;
        padding: 5px 0;
        background: transparent;
        border: 1px solid #4a8;
        border-radius: 3px;
        color: #4a8;
        font-family: 'IBM Plex Mono', monospace;
        font-size: 10px;
        cursor: pointer;
      `;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#1a2e1a';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });
      btn.addEventListener('click', () => {
        this.callbacks.onOpenTerminal(agent.id, this.buildingId, agent.name, this.buildingName);
        this.hide();
      });
      this.container.appendChild(btn);
    }

    // Position: above and to the right of cursor
    this.container.style.left = `${screenX + 16}px`;
    this.container.style.top = `${screenY - 20}px`;

    // Clamp to viewport
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
    this.currentAgentId = null;
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

  updatePosition(screenX: number, screenY: number): void {
    this.container.style.left = `${screenX + 16}px`;
    this.container.style.top = `${screenY - 20}px`;
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.container.remove();
  }
}
