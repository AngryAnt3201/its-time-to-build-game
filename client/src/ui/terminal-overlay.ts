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
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  visible = false;

  constructor(callbacks: TerminalOverlayCallbacks) {
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'terminal-overlay';
    this.container.style.cssText = `
      display: none;
      position: fixed;
      z-index: 1100;
      background: #0d0d0d;
      border: 1px solid #333;
      border-radius: 6px;
      overflow: hidden;
      font-family: 'IBM Plex Mono', monospace;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.8);
      transition: opacity 0.15s ease;
    `;

    this.header = document.createElement('div');
    this.header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: #1a1a1a;
      border-bottom: 1px solid #333;
      cursor: pointer;
      user-select: none;
    `;

    this.titleEl = document.createElement('span');
    this.titleEl.style.cssText = 'color: #aaa; font-size: 11px; flex: 1;';

    this.statusEl = document.createElement('span');
    this.statusEl.style.cssText = 'font-size: 9px; padding: 1px 6px; border-radius: 3px; background: #1a2e1a; color: #4a8;';
    this.statusEl.textContent = 'running';

    this.closeBtn = document.createElement('button');
    this.closeBtn.textContent = 'x';
    this.closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #666;
      font-size: 12px;
      cursor: pointer;
      padding: 0 4px;
      font-family: 'IBM Plex Mono', monospace;
    `;
    this.closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.unpin();
    });

    this.header.appendChild(this.titleEl);
    this.header.appendChild(this.statusEl);
    this.header.appendChild(this.closeBtn);

    this.terminalEl = document.createElement('div');
    this.terminalEl.style.cssText = 'width: 100%; height: calc(100% - 28px);';

    this.container.appendChild(this.header);
    this.container.appendChild(this.terminalEl);

    this.header.addEventListener('click', () => {
      if (!this.pinned) {
        this.pin();
      }
    });

    this.container.addEventListener('mouseenter', () => {
      this.cancelScheduledHide();
    });
    this.container.addEventListener('mouseleave', () => {
      if (!this.pinned) {
        this.scheduleHide();
      }
    });

    document.body.appendChild(this.container);
  }

  private getOrCreateInstance(agentId: number, buildingId: string, agentName: string, buildingName: string): TerminalInstance {
    let instance = this.instances.get(agentId);
    if (!instance) {
      const terminal = new Terminal({
        rows: 24,
        cols: 80,
        theme: {
          background: '#0d0d0d',
          foreground: '#cccccc',
          cursor: '#d4a017',
          selectionBackground: '#333333',
        },
        fontSize: 12,
        fontFamily: "'IBM Plex Mono', monospace",
        cursorBlink: true,
        scrollback: 5000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);

      terminal.onData((data) => {
        if (this.pinned) {
          this.callbacks.onInput(agentId, data);
        }
      });

      instance = { terminal, fitAddon, agentId, buildingId, agentName, buildingName };
      this.instances.set(agentId, instance);
    }
    return instance;
  }

  writeOutput(agentId: number, data: Uint8Array): void {
    const instance = this.instances.get(agentId);
    if (instance) {
      instance.terminal.write(data);
    } else {
      // Buffer output by creating a hidden instance
      const inst = this.getOrCreateInstance(agentId, '', '', '');
      inst.terminal.write(data);
    }
  }

  showPeek(agentId: number, buildingId: string, agentName: string, buildingName: string, screenX: number, screenY: number): void {
    if (this.pinned && this.activeAgentId === agentId) return;
    if (this.pinned) return;

    this.cancelScheduledHide();

    const instance = this.getOrCreateInstance(agentId, buildingId, agentName, buildingName);
    this.activeAgentId = agentId;

    this.container.style.width = '400px';
    this.container.style.height = '250px';
    this.container.style.opacity = '0.85';
    this.container.style.pointerEvents = 'auto';
    this.container.style.left = `${screenX}px`;
    this.container.style.top = `${screenY}px`;
    this.container.style.transform = 'translateX(-50%)';

    this.titleEl.textContent = `${agentName} → ${buildingName}`;
    this.statusEl.textContent = 'running';
    this.statusEl.style.background = '#1a2e1a';
    this.statusEl.style.color = '#4a8';

    if (!instance.terminal.element) {
      this.terminalEl.innerHTML = '';
      instance.terminal.open(this.terminalEl);
      instance.fitAddon.fit();
    } else if (instance.terminal.element.parentElement !== this.terminalEl) {
      this.terminalEl.innerHTML = '';
      this.terminalEl.appendChild(instance.terminal.element);
      instance.fitAddon.fit();
    }

    this.container.style.display = 'block';
    this.visible = true;
  }

  pin(): void {
    this.pinned = true;
    this.container.style.width = '700px';
    this.container.style.height = '450px';
    this.container.style.opacity = '1';

    const instance = this.activeAgentId !== null ? this.instances.get(this.activeAgentId) : null;
    if (instance) {
      requestAnimationFrame(() => instance.fitAddon.fit());
      instance.terminal.focus();
    }
  }

  unpin(): void {
    this.pinned = false;
    this.container.style.display = 'none';
    this.visible = false;
    this.activeAgentId = null;
  }

  updatePosition(screenX: number, screenY: number): void {
    if (!this.pinned) {
      this.container.style.left = `${screenX}px`;
      this.container.style.top = `${screenY}px`;
    }
  }

  sessionEnded(agentId: number, reason: string): void {
    const instance = this.instances.get(agentId);
    if (instance) {
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
      this.unpin();
    }
  }

  private scheduleHide(): void {
    if (this.hideTimer) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.pinned) {
        this.container.style.display = 'none';
        this.visible = false;
        this.activeAgentId = null;
      }
    }, 500);
  }

  private cancelScheduledHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  destroy(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    for (const instance of this.instances.values()) {
      instance.terminal.dispose();
    }
    this.container.remove();
  }
}
