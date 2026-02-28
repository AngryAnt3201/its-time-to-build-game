import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalOverlayCallbacks {
  onInput: (agentId: number, data: string) => void;
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  agentId: number;
  buildingId: string;
  agentName: string;
  buildingName: string;
  ended: boolean;
}

export class TerminalOverlay {
  private container: HTMLDivElement;
  private header: HTMLDivElement;
  private titleEl: HTMLSpanElement;
  private statusEl: HTMLSpanElement;
  private closeBtn: HTMLButtonElement;
  private terminalEl: HTMLDivElement;
  private callbacks: TerminalOverlayCallbacks;

  private instances: Map<number, TerminalInstance> = new Map();
  private activeAgentId: number | null = null;
  private pinned = false;

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

    this.container.appendChild(this.header);
    this.container.appendChild(this.terminalEl);

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

      instance = { terminal, fitAddon, agentId, buildingId, agentName, buildingName, ended: false };
      this.instances.set(agentId, instance);
    }
    return instance;
  }

  writeOutput(agentId: number, data: Uint8Array): void {
    let instance = this.instances.get(agentId);
    if (!instance) {
      instance = this.getOrCreateInstance(agentId, '', '', '');
    }
    instance.terminal.write(data);
    // Auto-scroll to latest output
    instance.terminal.scrollToBottom();
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

    // Fit to fill container, scroll to bottom, and focus
    requestAnimationFrame(() => {
      instance.fitAddon.fit();
      instance.terminal.scrollToBottom();
      instance.terminal.focus();
    });
  }

  close(): void {
    this.pinned = false;
    this.container.style.display = 'none';
    this.visible = false;
    this.activeAgentId = null;
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

  destroy(): void {
    for (const instance of this.instances.values()) {
      instance.terminal.dispose();
    }
    this.container.remove();
  }
}
