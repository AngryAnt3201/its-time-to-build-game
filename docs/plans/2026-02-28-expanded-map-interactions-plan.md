# Expanded Map Hover Tooltips & Zoom Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add hover tooltips (matching equipment HUD style) and scroll/keyboard zoom to the expanded minimap view.

**Architecture:** Add tooltip infrastructure (PixiJS Container with Text/Graphics) and zoom state to the existing Minimap class. Hit-test entities by converting screen coords to tile coords on pointermove. Zoom changes the tileScale parameter in the existing redraw pipeline. Wire scroll/key events in main.tsx.

**Tech Stack:** TypeScript, PixiJS 8

---

### Task 1: Add tooltip styles, fields, and construction to Minimap class

**Files:**
- Modify: `client/src/ui/minimap.ts`

**Step 1: Add tooltip styles after the existing `labelStyle` (after line 58)**

Add these style constants right after the `labelStyle` block:

```typescript
// ── Tooltip styles (matching equipment HUD) ─────────────────────────

const TOOLTIP_W = 230;

const tooltipNameStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 12,
  fontWeight: 'bold',
  fill: 0xd4a017,
});

const tooltipSubStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fontStyle: 'italic',
  fill: 0x8a7a5a,
});

const tooltipDescStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 10,
  fill: 0x9a9a8a,
  wordWrap: true,
  wordWrapWidth: 210,
});

const tooltipStatStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x6a8a6a,
});

const zoomLabelStyle = new TextStyle({
  fontFamily: FONT,
  fontSize: 9,
  fill: 0x5a5a4a,
});
```

**Step 2: Add tooltip and zoom fields to the class**

After `private labelText: Text;` (line 102), add:

```typescript

  // Tooltip (separate container, added to uiContainer for z-ordering)
  readonly tooltipContainer: Container;
  private tooltipBg: Graphics;
  private tooltipBrackets: Graphics;
  private tooltipName: Text;
  private tooltipSub: Text;
  private tooltipDesc: Text;
  private tooltipStat: Text;

  // Zoom state (expanded mode only)
  private expandedTileScale = 1;
  private zoomLabel: Text;

  // Cached rendering params for hit-testing (set during redraw)
  private lastStartTx = 0;
  private lastStartTy = 0;
  private lastTileScale = 1;
```

**Step 3: Build tooltip container in the constructor**

At the end of the constructor, before `this.drawPanel();` (line 162), add:

```typescript
    // ── Tooltip (separate container for z-ordering above everything) ──
    this.tooltipContainer = new Container();
    this.tooltipContainer.label = 'minimap-tooltip';
    this.tooltipContainer.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBg);

    this.tooltipBrackets = new Graphics();
    this.tooltipContainer.addChild(this.tooltipBrackets);

    this.tooltipName = new Text({ text: '', style: tooltipNameStyle });
    this.tooltipName.x = 10;
    this.tooltipName.y = 8;
    this.tooltipContainer.addChild(this.tooltipName);

    this.tooltipSub = new Text({ text: '', style: tooltipSubStyle });
    this.tooltipSub.x = 10;
    this.tooltipSub.y = 24;
    this.tooltipContainer.addChild(this.tooltipSub);

    this.tooltipDesc = new Text({ text: '', style: tooltipDescStyle });
    this.tooltipDesc.x = 10;
    this.tooltipDesc.y = 42;
    this.tooltipContainer.addChild(this.tooltipDesc);

    this.tooltipStat = new Text({ text: '', style: tooltipStatStyle });
    this.tooltipStat.x = 10;
    this.tooltipContainer.addChild(this.tooltipStat);

    // ── Zoom level label (bottom-right of map panel) ─────────────────
    this.zoomLabel = new Text({ text: '1.0x', style: zoomLabelStyle });
    this.zoomLabel.visible = false;
    this.container.addChild(this.zoomLabel);

    // ── Pointer events for tooltip ───────────────────────────────────
    this.container.on('pointermove', (e) => {
      if (!this._expanded) return;
      this.handlePointerMove(e.globalX, e.globalY);
    });
    this.container.on('pointerleave', () => {
      this.tooltipContainer.visible = false;
    });
```

**Step 4: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`

This will fail because `handlePointerMove` doesn't exist yet. That's expected — it's added in Task 2.

---

### Task 2: Implement tooltip hit-testing and display logic

**Files:**
- Modify: `client/src/ui/minimap.ts`

**Step 1: Add the `handlePointerMove` method**

Add this method after the `reposition()` method (after line 278):

```typescript
  // ── Tooltip hit-testing ────────────────────────────────────────────

  private handlePointerMove(globalX: number, globalY: number): void {
    // Convert global screen coords to local map pixel coords
    // The map sprite starts at container.x + 8, container.y + 20
    const mapLeftScreen = this.container.x + 8;
    const mapTopScreen = this.container.y + 20;
    const localPx = globalX - mapLeftScreen;
    const localPy = globalY - mapTopScreen;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // Out of map bounds — hide tooltip
    if (localPx < 0 || localPx >= w || localPy < 0 || localPy >= h) {
      this.tooltipContainer.visible = false;
      return;
    }

    // Convert map pixel to tile coords
    const tileScale = this.lastTileScale;
    const tx = this.lastStartTx + localPx * tileScale;
    const ty = this.lastStartTy + localPy * tileScale;

    // Check proximity to player first
    const playerTx = this.playerX / TILE_PX;
    const playerTy = this.playerY / TILE_PX;
    const playerDist = Math.abs(tx - playerTx) + Math.abs(ty - playerTy);
    if (playerDist < 3) {
      this.showEntityTooltip(globalX, globalY, {
        name: 'Player',
        sub: '',
        desc: `Position: (${Math.floor(this.playerX)}, ${Math.floor(this.playerY)})`,
        stat: '',
      });
      return;
    }

    // Find closest entity within 3 tiles
    let closest: EntityDelta | null = null;
    let closestDist = 3;

    for (const entity of this.allEntities.values()) {
      const etx = entity.position.x / TILE_PX;
      const ety = entity.position.y / TILE_PX;
      const dist = Math.abs(tx - etx) + Math.abs(ty - ety);
      if (dist < closestDist) {
        closestDist = dist;
        closest = entity;
      }
    }

    if (!closest) {
      this.tooltipContainer.visible = false;
      return;
    }

    // Format tooltip content based on entity type
    if ('Agent' in closest.data) {
      const a = closest.data.Agent;
      const hp = Math.round(a.health_pct * 100);
      const morale = Math.round(a.morale_pct * 100);
      this.showEntityTooltip(globalX, globalY, {
        name: a.name,
        sub: `${a.tier} Agent`,
        desc: `State: ${a.state}`,
        stat: `HP: ${hp}%  Morale: ${morale}%`,
      });
    } else if ('Building' in closest.data) {
      const b = closest.data.Building;
      const conPct = Math.round(b.construction_pct * 100);
      const hp = Math.round(b.health_pct * 100);
      const isComplete = b.construction_pct >= 1.0;
      this.showEntityTooltip(globalX, globalY, {
        name: b.building_type,
        sub: isComplete ? 'Complete' : `Under Construction ${conPct}%`,
        desc: isComplete ? 'Operational' : 'Building in progress...',
        stat: `HP: ${hp}%  Construction: ${isComplete ? 'Complete' : conPct + '%'}`,
      });
    } else if ('Rogue' in closest.data) {
      const r = closest.data.Rogue;
      const hp = Math.round(r.health_pct * 100);
      const level = r.rogue_type === 'Swarm' || r.rogue_type === 'TokenDrain' ? 1
        : r.rogue_type === 'Assassin' || r.rogue_type === 'Architect' ? 3 : 2;
      const stars = '★'.repeat(level);
      this.showEntityTooltip(globalX, globalY, {
        name: r.rogue_type,
        sub: `${stars} Rogue`,
        desc: `Hostile entity`,
        stat: `HP: ${hp}%  Level: ${stars}`,
      });
    }
  }

  private showEntityTooltip(
    globalX: number,
    globalY: number,
    info: { name: string; sub: string; desc: string; stat: string },
  ): void {
    this.tooltipName.text = info.name;
    this.tooltipSub.text = info.sub;
    this.tooltipDesc.text = info.desc;
    this.tooltipStat.text = info.stat;

    // Position stat text below desc
    const descBottom = this.tooltipDesc.y + this.tooltipDesc.height;
    this.tooltipStat.y = descBottom + 6;

    // Resize tooltip background to fit content
    const tooltipH = info.stat
      ? this.tooltipStat.y + this.tooltipStat.height + 10
      : descBottom + 10;

    this.tooltipBg.clear();
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.fill({ color: 0x0d0b08, alpha: 0.94 });
    this.tooltipBg.roundRect(0, 0, TOOLTIP_W, tooltipH, 3);
    this.tooltipBg.stroke({ color: 0x3a3020, alpha: 0.7, width: 1 });

    this.tooltipBrackets.clear();
    drawCornerBrackets(this.tooltipBrackets, 0, 0, TOOLTIP_W, tooltipH, 6, 0xd4a017, 0.35);

    // Position tooltip near cursor
    this.tooltipContainer.x = globalX + 16;
    this.tooltipContainer.y = globalY - 20;
    this.tooltipContainer.visible = true;
  }
```

**Step 2: Cache rendering params in `redraw()` for hit-testing**

In the `redraw()` method, after the `startTy` calculation (after line 298), add:

```typescript
    // Cache for hit-testing
    this.lastStartTx = startTx;
    this.lastStartTy = startTy;
    this.lastTileScale = tileScale;
```

**Step 3: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

---

### Task 3: Add zoom functionality

**Files:**
- Modify: `client/src/ui/minimap.ts`
- Modify: `client/src/main.tsx`

**Step 1: Add `zoomIn()` and `zoomOut()` methods to Minimap class**

Add after the `close()` method:

```typescript
  zoomIn(): void {
    if (!this._expanded) return;
    this.expandedTileScale = Math.max(0.5, this.expandedTileScale / 1.25);
    this.updateZoomLabel();
    this.frameCounter = REDRAW_INTERVAL; // force redraw
  }

  zoomOut(): void {
    if (!this._expanded) return;
    this.expandedTileScale = Math.min(4, this.expandedTileScale * 1.25);
    this.updateZoomLabel();
    this.frameCounter = REDRAW_INTERVAL; // force redraw
  }

  private updateZoomLabel(): void {
    const displayScale = 1 / this.expandedTileScale;
    this.zoomLabel.text = `${displayScale.toFixed(1)}x`;
  }
```

**Step 2: Use `expandedTileScale` in `redraw()` instead of the constant**

In `redraw()`, change line 287 from:

```typescript
    const tileScale = this._expanded ? EXPAND_TILE_SCALE : MINI_TILE_SCALE;
```

to:

```typescript
    const tileScale = this._expanded ? this.expandedTileScale : MINI_TILE_SCALE;
```

**Step 3: Show/hide zoom label and reset zoom on toggle**

In `toggle()`, after `this.drawPanel();` and before `this.reposition();`, add:

```typescript
    this.zoomLabel.visible = this._expanded;
    if (this._expanded) {
      this.expandedTileScale = EXPAND_TILE_SCALE;
      this.updateZoomLabel();
    }
```

**Step 4: Position zoom label in `drawPanel()`**

In `drawPanel()`, after `this.mapSprite.y = 20;` (end of the method), add:

```typescript
    // Position zoom label at bottom-right of panel
    this.zoomLabel.x = panelW - 36;
    this.zoomLabel.y = panelH - 14;
```

But guard it since `zoomLabel` doesn't exist during the first `drawPanel()` call in the constructor:

```typescript
    if (this.zoomLabel) {
      this.zoomLabel.x = panelW - 36;
      this.zoomLabel.y = panelH - 14;
    }
```

**Step 5: Hide tooltip on close**

In `close()`, before `this.toggle()`, add:

```typescript
    this.tooltipContainer.visible = false;
```

**Step 6: Wire zoom events in `main.tsx`**

In `main.tsx`, add the minimap tooltip container to the UI layer. After `uiContainer.addChild(minimap.container);` (line 112), add:

```typescript
  uiContainer.addChild(minimap.tooltipContainer);
```

In the keydown handler, inside the `if (minimap.expanded) { ... }` block (around line 302), before the `return;` that blocks other input, add:

```typescript
      if (key === '=' || key === '+') {
        minimap.zoomIn();
        return;
      }
      if (key === '-') {
        minimap.zoomOut();
        return;
      }
```

Add a scroll wheel handler. After the existing `contextmenu` event listener (around line 243), add:

```typescript
  app.canvas.addEventListener('wheel', (e: WheelEvent) => {
    if (minimap.expanded) {
      e.preventDefault();
      if (e.deltaY < 0) {
        minimap.zoomIn();
      } else {
        minimap.zoomOut();
      }
    }
  }, { passive: false });
```

**Step 7: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

---

### Task 4: Compile check and final verification

**Files:**
- All modified files

**Step 1: Full compile check**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

**Step 2: Manual verification checklist**

- [ ] Hover over agent dot on expanded map → tooltip appears with name, tier, state, HP/morale
- [ ] Hover over building dot → tooltip shows type, construction %, HP
- [ ] Hover over rogue dot → tooltip shows type, level stars, HP
- [ ] Hover over player dot → tooltip shows "Player" with position
- [ ] Move cursor off entities → tooltip hides
- [ ] Tooltip follows cursor with offset
- [ ] Tooltip styling matches equipment HUD exactly (dark bg, amber brackets, same fonts)
- [ ] Scroll wheel zooms in/out on expanded map
- [ ] +/- keys zoom in/out on expanded map
- [ ] Zoom label updates in bottom-right corner
- [ ] Zoom resets to 1.0x when closing and reopening expanded map
- [ ] Terrain renders correctly at different zoom levels
- [ ] Entity dots visible at all zoom levels
- [ ] Tooltip hides when closing expanded map
- [ ] No zoom on mini mode (only expanded)
