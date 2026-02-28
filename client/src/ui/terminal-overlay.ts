import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalOverlayCallbacks {
  onInput: (agentId: number, data: string) => void;
  checkPylonProximity: (buildingId: string) => boolean;
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  agentId: number;
  buildingId: string;
  agentName: string;
  buildingName: string;
  ended: boolean;
  lastResponseLines: string[];
}

export class TerminalOverlay {
  private container: HTMLDivElement;
  private header: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private closeBtn: HTMLButtonElement;
  private terminalEl: HTMLDivElement;
  private callbacks: TerminalOverlayCallbacks;

  private blindBanner: HTMLDivElement;
  private blindResponseArea: HTMLPreElement;
  private blindInputRow: HTMLDivElement;
  private blindInput: HTMLInputElement;
  private blindSendBtn: HTMLButtonElement;

  private instances: Map<number, TerminalInstance> = new Map();
  private activeAgentId: number | null = null;
  private pinned = false;
  private blindMode = false;
  private proximityInterval: ReturnType<typeof setInterval> | null = null;

  visible = false;

  constructor(callbacks: TerminalOverlayCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'terminal-overlay';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1100;
      background: #0d0b08;
      border: 1px solid #d4a017;
      border-radius: 6px;
      overflow: hidden;
      font-family: 'IBM Plex Mono', monospace;
      box-shadow: 0 0 16px rgba(212, 160, 23, 0.25), 0 4px 24px rgba(0, 0, 0, 0.8);
    `;

    this.header = document.createElement('div');
    this.header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #1a1510;
      border-bottom: 1px solid #3a3020;
      user-select: none;
    `;

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color: #d4a017; font-size: 11px; flex: 1; font-weight: bold;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'font-size: 9px; padding: 1px 6px; border-radius: 3px; background: #1a2e1a; color: #4a8;';
    this.statusEl.textContent = 'running';

    this.closeBtn = document.createElement('button');
    this.closeBtn.textContent = '\u2715';
    this.closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #7a6a3a;
      font-size: 14px;
      cursor: pointer;
      padding: 0 4px;
      font-family: 'IBM Plex Mono', monospace;
    `;
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.closeBtn.addEventListener('mouseenter', () => { this.closeBtn.style.color = '#d4a017'; });
    this.closeBtn.addEventListener('mouseleave', () => { this.closeBtn.style.color = '#7a6a3a'; });

    this.header.appendChild(this.titleEl);
    this.header.appendChild(this.statusEl);
    this.header.appendChild(this.closeBtn);

    this.terminalEl = document.createElement('div');
    this.terminalEl.style.cssText = 'width: 100%; height: calc(100% - 34px); overflow: hidden;';

    // ── Blind mode elements ──────────────────────────────────────
    this.blindBanner = document.createElement('div');
    this.blindBanner.style.cssText = `
      display: none;
      padding: 10px 14px;
      background: #2a1a00;
      border-bottom: 1px solid #3a3020;
      color: #d4a017;
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      line-height: 1.5;
    `;
    this.blindBanner.innerHTML = '<span style="font-size: 14px;">&#9888;</span> <strong>NO SIGNAL</strong><br>Build a Pylon nearby for full terminal access';

    this.blindResponseArea = document.createElement('pre');
    this.blindResponseArea.style.cssText = `
      display: none;
      flex: 1;
      margin: 0;
      padding: 10px 14px;
      overflow-y: auto;
      background: #0d0d0d;
      color: #999;
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;

    this.blindInputRow = document.createElement('div');
    this.blindInputRow.style.cssText = `
      display: none;
      padding: 8px 10px;
      background: #1a1510;
      border-top: 1px solid #3a3020;
      gap: 8px;
      align-items: center;
    `;

    this.blindInput = document.createElement('input');
    this.blindInput.type = 'text';
    this.blindInput.placeholder = 'Type a message...';
    this.blindInput.style.cssText = `
      flex: 1;
      background: #0d0b08;
      border: 1px solid #3a3020;
      border-radius: 4px;
      color: #ccc;
      font-size: 12px;
      font-family: 'IBM Plex Mono', monospace;
      padding: 6px 10px;
      outline: none;
    `;
    this.blindInput.addEventListener('focus', () => { this.blindInput.style.borderColor = '#d4a017'; });
    this.blindInput.addEventListener('blur', () => { this.blindInput.style.borderColor = '#3a3020'; });
    this.blindInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // prevent game key handling
      if (e.key === 'Enter') {
        this.sendBlindInput(this.blindInput.value);
      }
    });

    this.blindSendBtn = document.createElement('button');
    this.blindSendBtn.textContent = 'Send';
    this.blindSendBtn.style.cssText = `
      background: #d4a017;
      border: none;
      border-radius: 4px;
      color: #0d0b08;
      font-size: 11px;
      font-weight: bold;
      font-family: 'IBM Plex Mono', monospace;
      padding: 6px 14px;
      cursor: pointer;
    `;
    this.blindSendBtn.addEventListener('click', () => {
      this.sendBlindInput(this.blindInput.value);
    });

    this.blindInputRow.appendChild(this.blindInput);
    this.blindInputRow.appendChild(this.blindSendBtn);

    this.container.appendChild(this.header);
    this.container.appendChild(this.terminalEl);
    this.container.appendChild(this.blindBanner);
    this.container.appendChild(this.blindResponseArea);
    this.container.appendChild(this.blindInputRow);

    document.body.appendChild(this.container);
  }

  private getOrCreateInstance(agentId: number, buildingId: string, agentName: string, buildingName: string): TerminalInstance {
    let instance = this.instances.get(agentId);
    if (!instance) {
      const terminal = new Terminal({
        theme: {
          background: '#0d0d0d',
          foreground: '#cccccc',
          cursor: '#d4a017',
          selectionBackground: '#333333',
        },
        fontSize: 13,
        fontFamily: "'IBM Plex Mono', monospace",
        cursorBlink: true,
        scrollback: 10000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.onData((data) => {
        if (this.pinned) {
          this.callbacks.onInput(agentId, data);
        }
      });

      instance = { terminal, fitAddon, agentId, buildingId, agentName, buildingName, ended: false, lastResponseLines: [] };
      this.instances.set(agentId, instance);
    }
    return instance;
  }

  private static stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  writeOutput(agentId: number, data: Uint8Array): void {
    let instance = this.instances.get(agentId);
    if (!instance) {
      instance = this.getOrCreateInstance(agentId, '', '', '');
    }
    instance.terminal.write(data);
    instance.terminal.scrollToBottom();

    // Capture ANSI-stripped lines for blind mode
    const text = new TextDecoder().decode(data);
    const stripped = TerminalOverlay.stripAnsi(text);
    const newLines = stripped.split('\n').filter(l => l.trim().length > 0);
    instance.lastResponseLines.push(...newLines);
    // Keep only the last 20 lines
    if (instance.lastResponseLines.length > 20) {
      instance.lastResponseLines = instance.lastResponseLines.slice(-20);
    }

    // Update blind mode display if active and this is the visible agent
    if (this.blindMode && this.activeAgentId === agentId) {
      this.updateBlindResponseArea(instance);
    }
  }

  /** Open the terminal pinned and centered on screen for a specific agent. */
  openPinned(agentId: number, buildingId: string, agentName: string, buildingName: string): void {
    // If already pinned to this agent, just focus
    if (this.pinned && this.activeAgentId === agentId) {
      const inst = this.instances.get(agentId);
      if (inst) inst.terminal.focus();
      return;
    }

    const instance = this.getOrCreateInstance(agentId, buildingId, agentName, buildingName);
    this.activeAgentId = agentId;
    this.pinned = true;

    // Size and center on screen
    const w = 800;
    const h = 500;
    this.container.style.width = `${w}px`;
    this.container.style.height = `${h}px`;
    this.container.style.left = `${(window.innerWidth - w) / 2}px`;
    this.container.style.top = `${(window.innerHeight - h) / 2}px`;
    this.container.style.transform = 'none';
    this.container.style.opacity = '1';
    this.container.style.pointerEvents = 'auto';

    this.titleEl.textContent = `${agentName} \u2192 ${buildingName}`;

    if (instance.ended) {
      this.statusEl.textContent = 'ended';
      this.statusEl.style.background = '#2e1a1a';
      this.statusEl.style.color = '#c44';
    } else {
      this.statusEl.textContent = 'running';
      this.statusEl.style.background = '#1a2e1a';
      this.statusEl.style.color = '#4a8';
    }

    // Mount terminal — only call open() once per instance.
    // On subsequent opens, re-attach the existing element to preserve scrollback.
    if (!instance.terminal.element) {
      // First time: open creates the DOM
      this.terminalEl.innerHTML = '';
      instance.terminal.open(this.terminalEl);
    } else if (instance.terminal.element.parentElement !== this.terminalEl) {
      // Re-attach existing terminal DOM (preserves all state)
      this.terminalEl.innerHTML = '';
      this.terminalEl.appendChild(instance.terminal.element);
    }

    this.container.style.display = 'block';
    this.visible = true;

    // Check pylon proximity and set blind mode accordingly
    const hasCoverage = this.callbacks.checkPylonProximity(buildingId);
    this.setBlindMode(!hasCoverage);

    // Periodic proximity re-check every 2 seconds
    if (this.proximityInterval) clearInterval(this.proximityInterval);
    this.proximityInterval = setInterval(() => {
      if (!this.pinned || this.activeAgentId === null) return;
      const inst = this.instances.get(this.activeAgentId);
      if (!inst) return;
      const nowCovered = this.callbacks.checkPylonProximity(inst.buildingId);
      if (nowCovered && this.blindMode) {
        this.setBlindMode(false);
      } else if (!nowCovered && !this.blindMode) {
        this.setBlindMode(true);
      }
    }, 2000);

    // Fit to fill container, scroll to bottom, and focus
    if (!this.blindMode) {
      requestAnimationFrame(() => {
        instance.fitAddon.fit();
        instance.terminal.scrollToBottom();
        instance.terminal.focus();
      });
    }
  }

  close(): void {
    this.pinned = false;
    this.blindMode = false;
    this.container.style.display = 'none';
    this.visible = false;
    this.activeAgentId = null;
    if (this.proximityInterval) {
      clearInterval(this.proximityInterval);
      this.proximityInterval = null;
    }
  }

  sessionEnded(agentId: number, reason: string): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.ended = true;
      instance.terminal.write(`\r\n\x1b[33m[session ended: ${reason}]\x1b[0m\r\n`);
    }
    if (this.activeAgentId === agentId) {
      this.statusEl.textContent = 'ended';
      this.statusEl.style.background = '#2e1a1a';
      this.statusEl.style.color = '#c44';
    }
  }

  removeSession(agentId: number): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.terminal.dispose();
      this.instances.delete(agentId);
    }
    if (this.activeAgentId === agentId) {
      this.close();
    }
  }

  hasSession(agentId: number): boolean {
    return this.instances.has(agentId);
  }

  private setBlindMode(blind: boolean): void {
    this.blindMode = blind;
    if (blind) {
      this.terminalEl.style.display = 'none';
      this.blindBanner.style.display = 'block';
      this.blindResponseArea.style.display = 'block';
      this.blindInputRow.style.display = 'flex';
      // Use flex layout for the container so the response area fills space
      this.container.style.display = 'flex';
      this.container.style.flexDirection = 'column';
      // Populate response area with current buffer
      const inst = this.activeAgentId !== null ? this.instances.get(this.activeAgentId) : null;
      if (inst) this.updateBlindResponseArea(inst);
      // Focus the input
      requestAnimationFrame(() => this.blindInput.focus());
    } else {
      this.terminalEl.style.display = 'block';
      this.blindBanner.style.display = 'none';
      this.blindResponseArea.style.display = 'none';
      this.blindInputRow.style.display = 'none';
      // Restore block layout for xterm
      this.container.style.display = 'block';
      this.container.style.flexDirection = '';
      const inst = this.activeAgentId !== null ? this.instances.get(this.activeAgentId) : null;
      if (inst) {
        requestAnimationFrame(() => {
          inst.fitAddon.fit();
          inst.terminal.scrollToBottom();
          inst.terminal.focus();
        });
      }
    }
  }

  private updateBlindResponseArea(instance: TerminalInstance): void {
    this.blindResponseArea.textContent = instance.lastResponseLines.join('\n');
    this.blindResponseArea.scrollTop = this.blindResponseArea.scrollHeight;
  }

  private sendBlindInput(text: string): void {
    if (!text.trim() || this.activeAgentId === null) return;
    this.callbacks.onInput(this.activeAgentId, text + '\r');
    this.blindInput.value = '';
    // Visual feedback in the response area
    const inst = this.instances.get(this.activeAgentId);
    if (inst) {
      inst.lastResponseLines.push(`> ${text}`);
      if (inst.lastResponseLines.length > 20) {
        inst.lastResponseLines = inst.lastResponseLines.slice(-20);
      }
      this.updateBlindResponseArea(inst);
    }
  }

  destroy(): void {
    if (this.proximityInterval) {
      clearInterval(this.proximityInterval);
      this.proximityInterval = null;
    }
    for (const instance of this.instances.values()) {
      instance.terminal.dispose();
    }
    this.container.remove();
  }
}
