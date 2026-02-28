# Minimap & Expanded Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a minimap (bottom-right) with expandable fullscreen overlay showing terrain, entities, and fog of war.

**Architecture:** Offscreen canvas renders minimap content, wrapped as a PixiJS Texture displayed via Sprite. Throttled to redraw every 30 frames. Two modes: mini (180x180px corner panel) and expanded (~60% screen centered overlay). New `Minimap` class follows existing UI component patterns (Container, Graphics, resize method).

**Tech Stack:** TypeScript, PixiJS 8, HTML5 Canvas 2D API (offscreen)

---

### Task 1: Create Minimap class with offscreen canvas and mini-mode frame

**Files:**
- Create: `client/src/ui/minimap.ts`

**Step 1: Create the Minimap class skeleton**

Create `client/src/ui/minimap.ts` with the full minimap class. This includes:
- Offscreen canvas setup (180x180 for mini, dynamically sized for expanded)
- PixiJS Container with dark panel background, corner brackets, "MAP" label
- `Sprite` displaying the offscreen canvas as a PixiJS Texture
- `expanded` state toggle
- `resize(w, h)` method for repositioning
- Frame counter for throttled redraws (every 30 frames)

```typescript
import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { terrainAt } from '../renderer/world';
import type { EntityDelta, AgentStateKind } from '../network/protocol';

// ── Constants ────────────────────────────────────────────────────────

const FONT = '"IBM Plex Mono", monospace';
const MINI_SIZE = 180;
const MINI_TILE_SCALE = 2;   // 1 pixel = 2 tiles
const EXPAND_TILE_SCALE = 1; // 1 pixel = 1 tile
const REDRAW_INTERVAL = 30;  // frames between redraws

// ── Terrain color mapping ────────────────────────────────────────────

const TERRAIN_COLORS: Record<string, string> = {
  water: '#2244aa',
  stone: '#3a3a2a',
  stone_dark: '#2a2a1a',
  cliff_top: '#5a5a4a',
  cliff_bot: '#5a5a4a',
};
const DEFAULT_TERRAIN_COLOR = '#3a3a2a';
const FOG_COLOR = '#0a0a0a';

// ── Entity colors ────────────────────────────────────────────────────

const AGENT_STATE_COLORS: Record<AgentStateKind, string> = {
  Idle: '#ccaa44',
  Building: '#44cc66',
  Erroring: '#ff6644',
  Exploring: '#6688cc',
  Defending: '#cc4444',
  Critical: '#ff0000',
  Unresponsive: '#444444',
};

const BUILDING_COLOR = '#d4a017';
const ROGUE_COLOR = '#cc4444';
const PLAYER_COLOR = '#ffffff';

// ── Style ────────────────────────────────────────────────────────────

const labelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x7a6a3a,
  letterSpacing: 2,
});

// ── Corner bracket helper ────────────────────────────────────────────

function drawCornerBrackets(
  gfx: Graphics,
  x: number, y: number,
  w: number, h: number,
  size: number,
  color: number,
  alpha: number,
): void {
  gfx.moveTo(x, y + size);
  gfx.lineTo(x, y);
  gfx.lineTo(x + size, y);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + w - size, y);
  gfx.lineTo(x + w, y);
  gfx.lineTo(x + w, y + size);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + w, y + h - size);
  gfx.lineTo(x + w, y + h);
  gfx.lineTo(x + w - size, y + h);
  gfx.stroke({ color, alpha, width: 1.5 });

  gfx.moveTo(x + size, y + h);
  gfx.lineTo(x, y + h);
  gfx.lineTo(x, y + h - size);
  gfx.stroke({ color, alpha, width: 1.5 });
}

// ── Minimap class ────────────────────────────────────────────────────

export class Minimap {
  readonly container: Container;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapSprite: Sprite;
  private mapTexture: Texture;
  private panelBg: Graphics;
  private frameBrackets: Graphics;
  private labelText: Text;
  private viewportRect: Graphics;

  private _expanded = false;
  private screenWidth = 0;
  private screenHeight = 0;
  private frameCounter = 0;

  // Fog of war: tracks explored tile coordinates as "tx,ty" strings
  // Uses a coarse grid (1 entry per 4 tiles) to keep memory manageable
  private exploredTiles: Set<string> = new Set();

  // Cached entity positions for drawing
  private cachedEntities: EntityDelta[] = [];
  private playerX = 0;
  private playerY = 0;

  get expanded(): boolean { return this._expanded; }
  get visible(): boolean { return this._expanded; } // for menu-blocking checks

  constructor() {
    this.container = new Container();
    this.container.label = 'minimap';

    // ── Offscreen canvas ────────────────────────────────────────────
    this.canvas = document.createElement('canvas');
    this.canvas.width = MINI_SIZE;
    this.canvas.height = MINI_SIZE;
    this.ctx = this.canvas.getContext('2d')!;

    // ── Panel background ────────────────────────────────────────────
    this.panelBg = new Graphics();
    this.container.addChild(this.panelBg);

    // ── Corner brackets ─────────────────────────────────────────────
    this.frameBrackets = new Graphics();
    this.container.addChild(this.frameBrackets);

    // ── Map sprite (displays the offscreen canvas) ──────────────────
    this.mapTexture = Texture.from(this.canvas);
    this.mapSprite = new Sprite(this.mapTexture);
    this.mapSprite.x = 8;
    this.mapSprite.y = 20;
    this.container.addChild(this.mapSprite);

    // ── Viewport rectangle overlay (expanded mode only) ─────────────
    this.viewportRect = new Graphics();
    this.viewportRect.visible = false;
    this.container.addChild(this.viewportRect);

    // ── Label ───────────────────────────────────────────────────────
    this.labelText = new Text({ text: 'MAP', style: labelStyle });
    this.labelText.x = 10;
    this.labelText.y = 4;
    this.container.addChild(this.labelText);

    this.drawPanel();
  }

  // ── Panel drawing ─────────────────────────────────────────────────

  private drawPanel(): void {
    const canvasW = this.canvas.width;
    const canvasH = this.canvas.height;
    const panelW = canvasW + 16;
    const panelH = canvasH + 28;

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.fill({ color: 0x0d0b08, alpha: 0.82 });
    this.panelBg.roundRect(0, 0, panelW, panelH, 3);
    this.panelBg.stroke({ color: 0x2a2418, alpha: 0.6, width: 1 });

    this.frameBrackets.clear();
    drawCornerBrackets(this.frameBrackets, 0, 0, panelW, panelH, 10, 0xd4a017, 0.4);

    // Update sprite position
    this.mapSprite.x = 8;
    this.mapSprite.y = 20;
  }

  // ── Public API ────────────────────────────────────────────────────

  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.reposition();
  }

  toggle(): void {
    this._expanded = !this._expanded;

    if (this._expanded) {
      // Resize canvas to ~60% of screen
      const expandW = Math.floor(this.screenWidth * 0.6);
      const expandH = Math.floor(this.screenHeight * 0.6);
      this.canvas.width = expandW;
      this.canvas.height = expandH;
    } else {
      this.canvas.width = MINI_SIZE;
      this.canvas.height = MINI_SIZE;
    }

    // Recreate texture from resized canvas
    this.mapTexture.destroy();
    this.mapTexture = Texture.from(this.canvas);
    this.mapSprite.texture = this.mapTexture;

    this.drawPanel();
    this.reposition();
    this.viewportRect.visible = this._expanded;

    // Force immediate redraw
    this.frameCounter = REDRAW_INTERVAL;
  }

  close(): void {
    if (this._expanded) {
      this.toggle();
    }
  }

  /**
   * Called every frame from the game loop.
   * Caches entity data and redraws the minimap every REDRAW_INTERVAL frames.
   */
  update(
    playerX: number,
    playerY: number,
    entities: EntityDelta[],
  ): void {
    this.playerX = playerX;
    this.playerY = playerY;
    this.cachedEntities = entities;

    // Mark nearby tiles as explored (coarse grid: every 4 tiles)
    const TILE_PX = 16;
    const ptx = Math.floor(playerX / TILE_PX);
    const pty = Math.floor(playerY / TILE_PX);
    const exploreRadius = 20; // tiles around player to mark explored
    for (let dy = -exploreRadius; dy <= exploreRadius; dy += 4) {
      for (let dx = -exploreRadius; dx <= exploreRadius; dx += 4) {
        this.exploredTiles.add(`${ptx + dx},${pty + dy}`);
      }
    }

    // Throttled redraw
    this.frameCounter++;
    if (this.frameCounter >= REDRAW_INTERVAL) {
      this.frameCounter = 0;
      this.redraw();
    }
  }

  // ── Positioning ───────────────────────────────────────────────────

  private reposition(): void {
    const panelW = this.canvas.width + 16;
    const panelH = this.canvas.height + 28;

    if (this._expanded) {
      // Centered overlay
      this.container.x = Math.floor((this.screenWidth - panelW) / 2);
      this.container.y = Math.floor((this.screenHeight - panelH) / 2);
    } else {
      // Bottom-right corner with padding
      this.container.x = this.screenWidth - panelW - 16;
      this.container.y = this.screenHeight - panelH - 16;
    }
  }

  // ── Canvas rendering ──────────────────────────────────────────────

  private redraw(): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const TILE_PX = 16;

    const tileScale = this._expanded ? EXPAND_TILE_SCALE : MINI_TILE_SCALE;

    // Player tile position (center of map)
    const centerTx = Math.floor(this.playerX / TILE_PX);
    const centerTy = Math.floor(this.playerY / TILE_PX);

    // How many tiles the canvas covers
    const tilesWide = w * tileScale;
    const tilesHigh = h * tileScale;
    const startTx = centerTx - Math.floor(tilesWide / 2);
    const startTy = centerTy - Math.floor(tilesHigh / 2);

    // ── Draw terrain + fog ──────────────────────────────────────────
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const tx = startTx + px * tileScale;
        const ty = startTy + py * tileScale;

        // Check fog (coarse grid: round to nearest 4)
        const fogKey = `${Math.round(tx / 4) * 4},${Math.round(ty / 4) * 4}`;
        const explored = this.exploredTiles.has(fogKey);

        let r: number, g: number, b: number;

        if (!explored) {
          // Fog of war — near black
          r = 10; g = 10; b = 10;
        } else {
          const terrain = terrainAt(tx, ty);
          const color = TERRAIN_COLORS[terrain] || DEFAULT_TERRAIN_COLOR;
          r = parseInt(color.slice(1, 3), 16);
          g = parseInt(color.slice(3, 5), 16);
          b = parseInt(color.slice(5, 7), 16);
        }

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // ── Draw entities ───────────────────────────────────────────────
    for (const entity of this.cachedEntities) {
      const etx = entity.position.x / TILE_PX;
      const ety = entity.position.y / TILE_PX;

      // Convert world tile to minimap pixel
      const mpx = (etx - startTx) / tileScale;
      const mpy = (ety - startTy) / tileScale;

      // Skip if off-canvas
      if (mpx < 0 || mpx >= w || mpy < 0 || mpy >= h) continue;

      const dotSize = this._expanded ? 3 : 2;

      if ('Agent' in entity.data) {
        const color = AGENT_STATE_COLORS[entity.data.Agent.state];
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize, dotSize);
      } else if ('Building' in entity.data) {
        ctx.fillStyle = BUILDING_COLOR;
        ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize + 1, dotSize + 1);
      } else if ('Rogue' in entity.data) {
        ctx.fillStyle = ROGUE_COLOR;
        ctx.fillRect(Math.floor(mpx) - 1, Math.floor(mpy) - 1, dotSize, dotSize);
      }
    }

    // ── Draw player ─────────────────────────────────────────────────
    const playerMpx = Math.floor(w / 2);
    const playerMpy = Math.floor(h / 2);
    const playerDotSize = this._expanded ? 5 : 3;
    const half = Math.floor(playerDotSize / 2);

    ctx.fillStyle = PLAYER_COLOR;
    ctx.fillRect(playerMpx - half, playerMpy - half, playerDotSize, playerDotSize);

    // ── Draw viewport rect (expanded mode only) ─────────────────────
    if (this._expanded) {
      // Viewport in tiles
      const viewTilesW = this.screenWidth / (TILE_PX * 3); // ZOOM = 3
      const viewTilesH = this.screenHeight / (TILE_PX * 3);

      const rectX = (w / 2) - (viewTilesW / tileScale / 2);
      const rectY = (h / 2) - (viewTilesH / tileScale / 2);
      const rectW = viewTilesW / tileScale;
      const rectH = viewTilesH / tileScale;

      ctx.strokeStyle = '#d4a017';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.floor(rectX), Math.floor(rectY), Math.floor(rectW), Math.floor(rectH));
    }

    // ── Update PixiJS texture ───────────────────────────────────────
    this.mapTexture.source.update();
  }
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors unrelated to minimap)

**Step 3: Commit**

```bash
git add client/src/ui/minimap.ts
git commit -m "feat: add Minimap class with offscreen canvas rendering"
```

---

### Task 2: Integrate Minimap into main.tsx

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Add import and instantiation**

At the top of `main.tsx`, add the import alongside other UI imports:

```typescript
import { Minimap } from './ui/minimap';
```

Inside `startGame()`, after the other UI constructors (after `const debugPanel = new DebugPanel();`), add:

```typescript
const minimap = new Minimap();
```

**Step 2: Add to uiContainer**

After `uiContainer.addChild(debugPanel.container);`, add:

```typescript
uiContainer.addChild(minimap.container);
```

**Step 3: Add initial resize call**

After the existing `inventoryHud.resize(screenWidth, screenHeight);` call in the initial layout section, add:

```typescript
minimap.resize(screenWidth, screenHeight);
```

**Step 4: Add to window resize handler**

Inside the `window.addEventListener('resize', ...)` callback, after `inventoryHud.resize(w, h);`, add:

```typescript
minimap.resize(w, h);
```

**Step 5: Add M key binding**

In the keydown handler, after the grimoire toggle block (after `if (grimoire.visible) { ... return; }`), add:

```typescript
// ── Minimap key handling ─────────────────────────────────────────
if (key === 'm' && !buildMenu.visible && !upgradeTree.visible && !grimoire.visible) {
  minimap.toggle();
  return;
}

if (minimap.expanded) {
  if (key === 'escape') {
    minimap.close();
    return;
  }
  return; // block other input while expanded
}
```

**Step 6: Add minimap.visible to menuBlocking**

Change the `menuBlocking` line in the game loop from:

```typescript
const menuBlocking = buildMenu.visible || upgradeTree.visible || grimoire.visible || debugPanel.visible;
```

to:

```typescript
const menuBlocking = buildMenu.visible || upgradeTree.visible || grimoire.visible || debugPanel.visible || minimap.expanded;
```

**Step 7: Wire minimap update into game loop**

Inside the `if (latestState) { ... }` block, after `audioManager.handleAudioEvents(state.audio_triggers);` and before `previousTick = state.tick;`, add:

```typescript
// Update minimap with player position and all known entities
minimap.update(pos.x, pos.y, state.entities_changed);
```

**Step 8: Verify it compiles and run manually**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: integrate minimap into game loop with M key toggle"
```

---

### Task 3: Fix entity accumulation for minimap

**Problem:** `state.entities_changed` only contains entities that changed THIS tick, not all entities. The minimap needs ALL entity positions to render correctly.

**Files:**
- Modify: `client/src/ui/minimap.ts`
- Modify: `client/src/main.tsx`

**Step 1: Add entity tracking to Minimap**

In `minimap.ts`, change the `update` method signature and add an entity map. Replace the `cachedEntities` field and `update` method:

Replace the field:
```typescript
private cachedEntities: EntityDelta[] = [];
```

With:
```typescript
private allEntities: Map<number, EntityDelta> = new Map();
```

Replace the `update` method to accumulate entities over time:

```typescript
update(
  playerX: number,
  playerY: number,
  changedEntities: EntityDelta[],
  removedEntityIds: number[],
): void {
  this.playerX = playerX;
  this.playerY = playerY;

  // Accumulate entity state
  for (const entity of changedEntities) {
    this.allEntities.set(entity.id, entity);
  }
  for (const id of removedEntityIds) {
    this.allEntities.delete(id);
  }

  // Mark nearby tiles as explored
  const TILE_PX = 16;
  const ptx = Math.floor(playerX / TILE_PX);
  const pty = Math.floor(playerY / TILE_PX);
  const exploreRadius = 20;
  for (let dy = -exploreRadius; dy <= exploreRadius; dy += 4) {
    for (let dx = -exploreRadius; dx <= exploreRadius; dx += 4) {
      this.exploredTiles.add(`${ptx + dx},${pty + dy}`);
    }
  }

  // Throttled redraw
  this.frameCounter++;
  if (this.frameCounter >= REDRAW_INTERVAL) {
    this.frameCounter = 0;
    this.redraw();
  }
}
```

In the `redraw()` method, change the entity iteration from:
```typescript
for (const entity of this.cachedEntities) {
```
to:
```typescript
for (const entity of this.allEntities.values()) {
```

**Step 2: Update main.tsx call site**

In `main.tsx`, change the minimap update call to also pass removed entity IDs:

```typescript
minimap.update(pos.x, pos.y, state.entities_changed, state.entities_removed);
```

**Step 3: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add client/src/ui/minimap.ts client/src/main.tsx
git commit -m "fix: accumulate all entities for minimap rendering"
```

---

### Task 4: Visual polish and manual testing

**Files:**
- Modify: `client/src/ui/minimap.ts` (if needed)

**Step 1: Start the game and verify**

Run the client dev server:
```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npm run dev
```

Also start the Rust server (in another terminal):
```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo run
```

**Step 2: Verify checklist**

Manual testing checklist:
- [ ] Mini mode panel visible in bottom-right corner
- [ ] Terrain colors render correctly (water blue, ground dark, cliffs lighter)
- [ ] Player white dot centered on minimap
- [ ] Agent dots appear with correct state colors
- [ ] Building gold squares appear
- [ ] Rogue red dots appear
- [ ] Fog of war: unexplored areas are dark
- [ ] Press M: expanded overlay opens centered on screen
- [ ] ESC closes expanded overlay
- [ ] Viewport rectangle visible in expanded mode
- [ ] Movement blocked while expanded map is open
- [ ] Window resize repositions minimap correctly
- [ ] No performance regression (stays at 60fps)

**Step 3: Fix any issues found during testing**

Adjust colors, sizes, or positioning based on what looks right in-game.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: minimap with terrain, entities, fog of war, and expanded view"
```
