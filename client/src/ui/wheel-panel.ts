import type { PlayerAction, WheelSnapshot } from '../network/protocol';

// ── Style constants ──────────────────────────────────────────────────

const FONT = "'IBM Plex Mono', monospace";
const gold = '#d4a017';
const darkBg = '#1a1a1a';
const panelBg = '#2a2a1a';

// ── WheelPanel ───────────────────────────────────────────────────────

export interface WheelPanelCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class WheelPanel {
  visible = false;

  private readonly container: HTMLDivElement;
  private readonly tierEl: HTMLSpanElement;
  private readonly rateEl: HTMLSpanElement;
  private readonly agentBonusEl: HTMLSpanElement;
  private readonly heatFill: HTMLDivElement;
  private readonly heatLabel: HTMLSpanElement;
  private readonly upgradeBtn: HTMLButtonElement;
  private readonly agentSlotEl: HTMLDivElement;
  private readonly callbacks: WheelPanelCallbacks;

  constructor(callbacks: WheelPanelCallbacks) {
    this.callbacks = callbacks;

    // ── Container ─────────────────────────────────────────────────
    this.container = document.createElement('div');
    this.container.id = 'wheel-panel';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '400px',
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

    // ── Header ────────────────────────────────────────────────────
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      padding: '12px 16px',
      borderBottom: `1px solid #3a3020`,
    });

    const title = document.createElement('h2');
    Object.assign(title.style, {
      margin: '0',
      fontSize: '18px',
      fontWeight: 'bold',
      color: gold,
      fontFamily: FONT,
      flex: '1',
    });
    title.textContent = 'Token Wheel';

    const closeBtn = document.createElement('button');
    Object.assign(closeBtn.style, {
      padding: '4px 14px',
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

    header.appendChild(title);
    header.appendChild(closeBtn);

    // ── Body ──────────────────────────────────────────────────────
    const body = document.createElement('div');
    Object.assign(body.style, {
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      background: panelBg,
    });

    // Tier display
    const tierRow = this.makeRow('Tier:');
    this.tierEl = tierRow.value;

    // Token rate display
    const rateRow = this.makeRow('Tokens / rotation:');
    this.rateEl = rateRow.value;

    // Agent bonus display
    const agentBonusRow = this.makeRow('Agent bonus / tick:');
    this.agentBonusEl = agentBonusRow.value;

    // Heat bar
    const heatRow = document.createElement('div');
    Object.assign(heatRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });

    const heatLabelText = document.createElement('span');
    Object.assign(heatLabelText.style, { fontSize: '12px', color: '#c8b06b', minWidth: '50px' });
    heatLabelText.textContent = 'Heat:';

    const heatBarBg = document.createElement('div');
    Object.assign(heatBarBg.style, {
      flex: '1',
      height: '14px',
      background: '#111',
      borderRadius: '3px',
      border: '1px solid #3a3020',
      overflow: 'hidden',
      position: 'relative',
    });

    this.heatFill = document.createElement('div');
    Object.assign(this.heatFill.style, {
      height: '100%',
      width: '0%',
      background: 'linear-gradient(90deg, #cc6600, #ff4400)',
      borderRadius: '3px',
      transition: 'width 0.2s ease',
    });

    this.heatLabel = document.createElement('span');
    Object.assign(this.heatLabel.style, {
      fontSize: '10px',
      color: '#c8b06b',
      minWidth: '50px',
      textAlign: 'right',
    });

    heatBarBg.appendChild(this.heatFill);
    heatRow.appendChild(heatLabelText);
    heatRow.appendChild(heatBarBg);
    heatRow.appendChild(this.heatLabel);

    // Upgrade button
    this.upgradeBtn = document.createElement('button');
    Object.assign(this.upgradeBtn.style, {
      padding: '8px 16px',
      fontSize: '13px',
      fontFamily: FONT,
      fontWeight: 'bold',
      background: '#2a2418',
      color: gold,
      border: `1px solid ${gold}`,
      borderRadius: '4px',
      cursor: 'pointer',
      textAlign: 'center',
    });
    this.upgradeBtn.textContent = 'Upgrade';
    this.upgradeBtn.addEventListener('click', () => {
      if (!this.upgradeBtn.disabled) {
        this.callbacks.onAction('UpgradeWheel');
      }
    });
    this.upgradeBtn.addEventListener('mouseenter', () => {
      if (!this.upgradeBtn.disabled) this.upgradeBtn.style.background = '#3a3020';
    });
    this.upgradeBtn.addEventListener('mouseleave', () => {
      this.upgradeBtn.style.background = '#2a2418';
    });

    // Assigned agent slot
    const agentSection = document.createElement('div');
    Object.assign(agentSection.style, {
      borderTop: '1px solid #3a3020',
      paddingTop: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    });

    const agentLabel = document.createElement('span');
    Object.assign(agentLabel.style, { fontSize: '12px', color: '#c8b06b' });
    agentLabel.textContent = 'Assigned Agent:';

    this.agentSlotEl = document.createElement('div');
    Object.assign(this.agentSlotEl.style, {
      padding: '8px 12px',
      background: '#111',
      border: '1px solid #3a3020',
      borderRadius: '4px',
      fontSize: '12px',
      color: '#666',
      minHeight: '20px',
    });
    this.agentSlotEl.textContent = '(none)';

    agentSection.appendChild(agentLabel);
    agentSection.appendChild(this.agentSlotEl);

    body.appendChild(tierRow.row);
    body.appendChild(rateRow.row);
    body.appendChild(agentBonusRow.row);
    body.appendChild(heatRow);
    body.appendChild(this.upgradeBtn);
    body.appendChild(agentSection);

    this.container.appendChild(header);
    this.container.appendChild(body);

    document.body.appendChild(this.container);
  }

  // ── Public API ──────────────────────────────────────────────────

  open(): void {
    this.container.style.display = 'flex';
    this.visible = true;
  }

  close(): void {
    this.container.style.display = 'none';
    this.visible = false;
    this.callbacks.onClose();
  }

  update(wheel: WheelSnapshot, agentNames: Map<number, string>): void {
    this.tierEl.textContent = wheel.tier;
    this.rateEl.textContent = String(wheel.tokens_per_rotation);
    this.agentBonusEl.textContent = String(wheel.agent_bonus_per_tick);

    const heatPct = wheel.max_heat > 0 ? (wheel.heat / wheel.max_heat) * 100 : 0;
    this.heatFill.style.width = `${Math.min(100, heatPct)}%`;
    this.heatLabel.textContent = `${Math.round(wheel.heat)}/${wheel.max_heat}`;

    if (wheel.upgrade_cost != null) {
      this.upgradeBtn.textContent = `Upgrade (${wheel.upgrade_cost} tokens)`;
      this.upgradeBtn.disabled = false;
      this.upgradeBtn.style.opacity = '1';
      this.upgradeBtn.style.cursor = 'pointer';
    } else {
      this.upgradeBtn.textContent = 'Max Tier';
      this.upgradeBtn.disabled = true;
      this.upgradeBtn.style.opacity = '0.4';
      this.upgradeBtn.style.cursor = 'not-allowed';
    }

    if (wheel.assigned_agent_id != null) {
      const name = agentNames.get(wheel.assigned_agent_id) ?? `Agent #${wheel.assigned_agent_id}`;
      this.agentSlotEl.textContent = name;
      this.agentSlotEl.style.color = gold;
    } else {
      this.agentSlotEl.textContent = '(none)';
      this.agentSlotEl.style.color = '#666';
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  private makeRow(label: string): { row: HTMLDivElement; value: HTMLSpanElement } {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px' });

    const labelEl = document.createElement('span');
    Object.assign(labelEl.style, { fontSize: '12px', color: '#c8b06b', minWidth: '140px' });
    labelEl.textContent = label;

    const value = document.createElement('span');
    Object.assign(value.style, { fontSize: '13px', color: gold, fontWeight: 'bold' });

    row.appendChild(labelEl);
    row.appendChild(value);

    return { row, value };
  }
}
