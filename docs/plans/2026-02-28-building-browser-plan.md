# Building Browser & Hotbar Tooltips Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the old 7-item vertical build menu with a paginated building browser showing all 30+ buildings by tier, add a "+" button to the hotbar to open it, and add hover tooltips to hotbar slots.

**Architecture:** New `BuildingBrowser` PixiJS component replaces `BuildMenu` with a 4-page grid (one tier per page). `BuildHotbar` gains a "+" slot and mouse-hover tooltip support. A new `HotbarTooltip` HTML overlay shows building details on hover.

**Tech Stack:** PixiJS (Container, Graphics, Text), HTML/CSS (tooltip overlay), TypeScript

---

### Task 1: Create Client-Side Building Data

**Files:**
- Create: `client/src/data/buildings.ts`

**Step 1: Create the buildings data file**

This file is the client-side source of truth for all building definitions. It mirrors the server's `buildings_manifest.json` but uses PascalCase `BuildingTypeKind` values for type safety.

```typescript
import type { BuildingTypeKind } from '../network/protocol';

export interface BuildingDef {
  type: BuildingTypeKind;
  name: string;
  cost: number;
  description: string;
  tier: number;
  port: number;
  directoryName: string;
}

export const TIER_NAMES: Record<number, string> = {
  0: 'INFRASTRUCTURE',
  1: 'TIER 1 — HUT ERA',
  2: 'TIER 2 — OUTPOST ERA',
  3: 'TIER 3 — VILLAGE ERA',
  4: 'TIER 4 — NETWORK ERA',
};

export const ALL_BUILDINGS: BuildingDef[] = [
  // Infrastructure (shown on page 1 alongside Tier 1)
  { type: 'Pylon', name: 'Pylon', cost: 30, description: 'Illuminates surrounding area', tier: 0, port: 0, directoryName: '' },
  { type: 'ComputeFarm', name: 'Compute Farm', cost: 80, description: 'Passive token generation', tier: 0, port: 0, directoryName: '' },

  // Tier 1 — Hut Era
  { type: 'TodoApp', name: 'Todo App', cost: 50, description: 'Classic todo list with add/complete/delete', tier: 1, port: 3101, directoryName: 'todo-app' },
  { type: 'Calculator', name: 'Calculator', cost: 60, description: 'Calculator with basic operations', tier: 1, port: 3102, directoryName: 'calculator' },
  { type: 'LandingPage', name: 'Landing Page', cost: 40, description: 'Single-page marketing site', tier: 1, port: 3103, directoryName: 'landing-page' },
  { type: 'PortfolioSite', name: 'Portfolio Site', cost: 70, description: 'Personal portfolio with project cards', tier: 1, port: 3104, directoryName: 'portfolio-site' },
  { type: 'PomodoroTimer', name: 'Pomodoro Timer', cost: 55, description: 'Timer with work/break intervals', tier: 1, port: 3105, directoryName: 'pomodoro-timer' },
  { type: 'WeatherApp', name: 'Weather App', cost: 65, description: 'Weather dashboard with mock data', tier: 1, port: 3106, directoryName: 'weather-app' },
  { type: 'ColourPickerTool', name: 'Colour Picker Tool', cost: 45, description: 'Color picker with hex/rgb output', tier: 1, port: 3107, directoryName: 'colour-picker-tool' },

  // Tier 2 — Outpost Era
  { type: 'RestApi', name: 'REST API', cost: 150, description: 'API docs viewer and endpoint tester', tier: 2, port: 3111, directoryName: 'rest-api' },
  { type: 'AuthenticationSystem', name: 'Authentication System', cost: 180, description: 'Login and register with mock auth', tier: 2, port: 3112, directoryName: 'authentication-system' },
  { type: 'Database', name: 'Database', cost: 200, description: 'Data table browser and editor', tier: 2, port: 3113, directoryName: 'database' },
  { type: 'AdminDashboard', name: 'Admin Dashboard', cost: 170, description: 'Dashboard with charts and stats', tier: 2, port: 3114, directoryName: 'admin-dashboard' },
  { type: 'SearchBar', name: 'Search Bar', cost: 130, description: 'Search interface with filters', tier: 2, port: 3115, directoryName: 'search-bar' },
  { type: 'FormWithValidation', name: 'Form with Validation', cost: 140, description: 'Multi-step form with validation', tier: 2, port: 3116, directoryName: 'form-with-validation' },
  { type: 'MarkdownEditor', name: 'Markdown Editor', cost: 160, description: 'Split-pane editor with preview', tier: 2, port: 3117, directoryName: 'markdown-editor' },
  { type: 'BudgetTracker', name: 'Budget Tracker', cost: 155, description: 'Income/expense tracker with charts', tier: 2, port: 3118, directoryName: 'budget-tracker' },

  // Tier 3 — Village Era
  { type: 'CiCdPipeline', name: 'CI/CD Pipeline', cost: 300, description: 'Pipeline stage visualizer', tier: 3, port: 3121, directoryName: 'ci-cd-pipeline' },
  { type: 'UnitTestSuite', name: 'Unit Test Suite', cost: 280, description: 'Test runner results dashboard', tier: 3, port: 3122, directoryName: 'unit-test-suite' },
  { type: 'CliTool', name: 'CLI Tool', cost: 320, description: 'Web-based terminal emulator', tier: 3, port: 3123, directoryName: 'cli-tool' },
  { type: 'BrowserExtension', name: 'Browser Extension', cost: 260, description: 'Extension options page', tier: 3, port: 3124, directoryName: 'browser-extension' },
  { type: 'RecommendationEngine', name: 'Recommendation Engine', cost: 350, description: 'Content feed with recommendations', tier: 3, port: 3125, directoryName: 'recommendation-engine' },
  { type: 'NotificationSystem', name: 'Notification System', cost: 270, description: 'Notification center and inbox', tier: 3, port: 3126, directoryName: 'notification-system' },
  { type: 'RateLimiter', name: 'Rate Limiter', cost: 290, description: 'Rate limit config and traffic viz', tier: 3, port: 3127, directoryName: 'rate-limiter' },
  { type: 'OauthIntegration', name: 'OAuth Integration', cost: 310, description: 'OAuth flow demo with providers', tier: 3, port: 3128, directoryName: 'oauth-integration' },
  { type: 'WebsocketServer', name: 'Websocket Server', cost: 340, description: 'Real-time chat application', tier: 3, port: 3129, directoryName: 'websocket-server' },

  // Tier 4 — Network Era
  { type: 'MachineLearningModel', name: 'Machine Learning Model', cost: 500, description: 'ML prediction playground', tier: 4, port: 3131, directoryName: 'machine-learning-model' },
  { type: 'VectorDatabase', name: 'Vector Database', cost: 480, description: 'Similarity search interface', tier: 4, port: 3132, directoryName: 'vector-database' },
  { type: 'GraphqlApi', name: 'GraphQL API', cost: 450, description: 'GraphQL query playground', tier: 4, port: 3133, directoryName: 'graphql-api' },
  { type: 'TransformerModel', name: 'Transformer Model', cost: 800, description: 'Text generation interface', tier: 4, port: 3134, directoryName: 'transformer-model' },
  { type: 'RagPipeline', name: 'RAG Pipeline', cost: 550, description: 'Document Q&A search', tier: 4, port: 3135, directoryName: 'rag-pipeline' },
  { type: 'AutonomousAgentFramework', name: 'Autonomous Agent Framework', cost: 600, description: 'Agent task board', tier: 4, port: 3136, directoryName: 'autonomous-agent-framework' },
];

/** Get all buildings for a specific page. Page 1 = infrastructure + tier 1, pages 2-4 = tiers 2-4. */
export function getBuildingsForPage(page: number): BuildingDef[] {
  if (page === 1) return ALL_BUILDINGS.filter(b => b.tier <= 1);
  return ALL_BUILDINGS.filter(b => b.tier === page);
}

/** Get the tier name for a page number. */
export function getPageTitle(page: number): string {
  if (page === 1) return TIER_NAMES[1];
  return TIER_NAMES[page] ?? `TIER ${page}`;
}

/** Total number of pages. */
export const TOTAL_PAGES = 4;

/** Convert PascalCase building type to snake_case ID. */
export function buildingTypeToId(type: string): string {
  return type.replace(/([A-Z])/g, (_, p1: string, offset: number) =>
    offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase(),
  );
}
```

**Step 2: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/data/buildings.ts
git commit -m "feat: add client-side building data definitions for all 30 buildings"
```

---

### Task 2: Rewrite BuildMenu as BuildingBrowser

**Files:**
- Rewrite: `client/src/ui/build-menu.ts` — Replace vertical list with paginated grid

The BuildingBrowser is a PixiJS overlay with:
- 4 pages (tier 1 = page 1 including infrastructure, tiers 2-4 = pages 2-4)
- Grid of building cards (4 columns)
- Left/Right arrow pagination
- Arrow key grid navigation
- Enter to select + enter placement mode
- Locked building visual treatment
- Page indicator ("Page 1/4") and tier header

**Step 1: Rewrite build-menu.ts**

Keep the same file path and export name (`BuildMenu`) for backwards compatibility with main.tsx. Internally it becomes a paginated grid browser.

Key layout constants:
```
PANEL_WIDTH = 520
PANEL_HEIGHT = 420
CARD_W = 110
CARD_H = 72
CARD_GAP = 8
COLS = 4
ROWS_PER_PAGE = 3  (max 12 cards per page; largest page is Tier 1 with 9)
```

The class keeps the same public API surface:
- `container: Container`
- `visible: boolean`
- `placementMode: boolean`
- `placementBuilding: BuildingEntry | null`
- `onPlace: callback`
- `ghostGraphic: Graphics`
- `toggle()`, `open()`, `close()`
- `selectPrev()`, `selectNext()` — now navigate grid (up/down)
- `confirmSelection()`
- `updateGhostPosition()`, `confirmPlacement()`, `cancelPlacement()`
- `resize()`
- `setUnlockedBuildings()`

New methods:
- `selectLeft()`, `selectRight()` — navigate grid columns
- `nextPage()`, `prevPage()` — change tier pages

Each card renders:
- Rounded rect background with corner brackets
- Building name (centered, 11px, amber for unlocked / grey for locked)
- Cost with diamond icon (centered, 9px)
- "[LOCKED]" label on locked cards (8px, dark red)
- Selected card gets bright gold border

Page navigation:
- Header shows tier name: "TIER 1 — HUT ERA"
- Footer shows "Page 1/4" with "◄ ►" indicators
- Left/Right arrow keys (when not selecting in grid) change pages

Import building data from `../data/buildings` instead of hardcoding.

The existing `BuildingEntry` interface should be preserved or re-exported from the data file for compatibility with hotbar.

**Step 2: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/ui/build-menu.ts
git commit -m "feat: rewrite build menu as paginated building browser with card grid"
```

---

### Task 3: Update main.tsx Keyboard Handling for Browser

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Update build menu keyboard handling**

The build menu section in `main.tsx` (lines 458-482) currently handles up/down/enter/escape. Update to also handle left/right for grid navigation and page switching:

In the `if (buildMenu.visible)` block, replace the keyboard handling:

```typescript
if (buildMenu.visible) {
  if (key === 'arrowup' || key === 'w') {
    buildMenu.selectPrev();  // up in grid
    return;
  }
  if (key === 'arrowdown' || key === 's') {
    buildMenu.selectNext();  // down in grid
    return;
  }
  if (key === 'arrowleft' || key === 'a') {
    buildMenu.selectLeft();  // left in grid, or prev page at edge
    return;
  }
  if (key === 'arrowright' || key === 'd') {
    buildMenu.selectRight();  // right in grid, or next page at edge
    return;
  }
  if (key === 'enter') {
    buildMenu.confirmSelection();
    return;
  }
  if (key === 'escape' || key === 'b') {
    buildMenu.close();
    return;
  }
  return;
}
```

Also update the hotbar key range to include '0' for the "+" button:

```typescript
// After the '1'-'7' block, add:
if (key === '0') {
  buildMenu.toggle();
  return;
}
```

**Step 2: Update the BuildingEntry import**

If the `BuildingEntry` type moved to `data/buildings.ts`, update the import in `build-hotbar.ts` callback. Or ensure `build-menu.ts` still re-exports it.

**Step 3: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: add left/right/page navigation and 0-key for building browser"
```

---

### Task 4: Add "+" Button to Hotbar

**Files:**
- Modify: `client/src/ui/build-hotbar.ts`

**Step 1: Add the "+" slot**

After the 7 existing slots, add an 8th slot styled differently:
- Dotted border (not solid)
- "+" text instead of building name
- "0" as the key label
- Muted styling (no cost line)
- Click calls a new `onOpenBrowser` callback

Add to the class:
```typescript
/** Callback when the "+" button is clicked to open the full browser. */
onOpenBrowser: (() => void) | null = null;
```

In `buildSlots()`, after the loop for normal entries, add:

```typescript
// "+" button slot
const plusSlot = new Container();
plusSlot.x = PADDING + this.entries.length * (SLOT_W + SLOT_GAP);
plusSlot.y = 18;

const plusBg = new Graphics();
plusBg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
plusBg.fill({ color: 0x111010, alpha: 0.5 });
// Dotted border effect: just use a dimmer stroke
plusBg.roundRect(0, 0, SLOT_W, SLOT_H, 2);
plusBg.stroke({ color: 0x3a3a2a, alpha: 0.6, width: 1 });
plusSlot.addChild(plusBg);

const keyText = new Text({ text: '0', style: slotKeyStyle });
keyText.x = 3;
keyText.y = 1;
plusSlot.addChild(keyText);

const plusText = new Text({ text: '+', style: new TextStyle({
  fontFamily: FONT,
  fontSize: 18,
  fill: 0x7a6a3a,
}) });
plusText.x = Math.round((SLOT_W - plusText.width) / 2);
plusText.y = Math.round((SLOT_H - plusText.height) / 2);
plusSlot.addChild(plusText);

this.container.addChild(plusSlot);
```

Update `panelWidth()` to account for the extra slot:

```typescript
private panelWidth(): number {
  return (this.entries.length + 1) * (SLOT_W + SLOT_GAP) + PADDING * 2 - SLOT_GAP;
}
```

**Step 2: Add mouse event support for tooltip tracking**

Add a public method for main.tsx to use when checking hover:

```typescript
/** Get the slot index at the given screen-relative position, or -1 if none. */
getSlotAtPosition(localX: number, localY: number): number {
  const slotY = 18;
  if (localY < slotY || localY > slotY + SLOT_H) return -1;
  const col = Math.floor((localX - PADDING) / (SLOT_W + SLOT_GAP));
  const withinSlot = (localX - PADDING) % (SLOT_W + SLOT_GAP) < SLOT_W;
  if (!withinSlot) return -1;
  if (col >= 0 && col < this.entries.length) return col;
  if (col === this.entries.length) return -2; // "+" button
  return -1;
}
```

Return values: 0-6 = building slots, -2 = "+" button, -1 = nothing.

**Step 3: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/ui/build-hotbar.ts
git commit -m "feat: add '+' button and hover position tracking to hotbar"
```

---

### Task 5: Create Hotbar Tooltip

**Files:**
- Create: `client/src/ui/hotbar-tooltip.ts`

**Step 1: Create the tooltip component**

An HTML div tooltip that appears above hovered hotbar slots. Not PixiJS — plain HTML for crisp text rendering.

```typescript
export class HotbarTooltip {
  private container: HTMLDivElement;
  private nameEl: HTMLDivElement;
  private costEl: HTMLDivElement;
  private descEl: HTMLDivElement;
  private tierEl: HTMLDivElement;
  private statusEl: HTMLDivElement;

  visible = false;

  constructor() {
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

    this.nameEl = document.createElement('div');
    this.nameEl.style.cssText = 'color: #d4a017; font-size: 13px; font-weight: bold; margin-bottom: 2px;';

    this.costEl = document.createElement('div');
    this.costEl.style.cssText = 'color: #8a8a6a; font-size: 11px; margin-bottom: 4px;';

    this.descEl = document.createElement('div');
    this.descEl.style.cssText = 'color: #9a9a7a; font-size: 10px; font-style: italic; margin-bottom: 4px;';

    this.tierEl = document.createElement('div');
    this.tierEl.style.cssText = 'color: #6a5a3a; font-size: 9px; margin-bottom: 2px;';

    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size: 9px;';

    this.container.appendChild(this.nameEl);
    this.container.appendChild(this.costEl);
    this.container.appendChild(this.descEl);
    this.container.appendChild(this.tierEl);
    this.container.appendChild(this.statusEl);

    document.body.appendChild(this.container);
  }

  /** Show the tooltip at the given screen position with building info. */
  show(screenX: number, screenY: number, name: string, cost: number, description: string, tierLabel: string, status: string) {
    this.nameEl.textContent = name;
    this.costEl.textContent = `${cost} tokens`;
    this.descEl.textContent = description;
    this.tierEl.textContent = tierLabel;

    // Status coloring
    if (status === 'Locked') {
      this.statusEl.textContent = '🔒 Locked';
      this.statusEl.style.color = '#8b4444';
    } else if (status === 'Built') {
      this.statusEl.textContent = '✓ Already Built';
      this.statusEl.style.color = '#6b8b6b';
    } else {
      this.statusEl.textContent = '◆ Available';
      this.statusEl.style.color = '#d4a017';
    }

    // Position above the slot (offset upward by tooltip height + gap)
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
```

**Step 2: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/ui/hotbar-tooltip.ts
git commit -m "feat: add HTML hotbar tooltip component"
```

---

### Task 6: Wire Tooltip and "+" Button in main.tsx

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Import new components**

Add imports:
```typescript
import { HotbarTooltip } from './ui/hotbar-tooltip';
import { ALL_BUILDINGS, TIER_NAMES, buildingTypeToId as buildingIdFromType } from './data/buildings';
```

**Step 2: Create HotbarTooltip instance**

After creating the other UI components:
```typescript
const hotbarTooltip = new HotbarTooltip();
```

**Step 3: Wire the "+" button**

After the `buildHotbar.onSelect` callback setup:
```typescript
buildHotbar.onOpenBrowser = () => {
  buildMenu.open();
};
```

**Step 4: Add mousemove handler for tooltip**

Add a mousemove listener on the canvas that checks if the mouse is over a hotbar slot:

```typescript
let lastHoveredSlot = -1;

app.canvas.addEventListener('mousemove', (e: MouseEvent) => {
  // ... existing placement mode mouse tracking ...

  // Hotbar tooltip tracking
  const hotbarBounds = buildHotbar.container.getBounds();
  const localX = e.clientX - hotbarBounds.x;
  const localY = e.clientY - hotbarBounds.y;
  const slotIdx = buildHotbar.getSlotAtPosition(localX, localY);

  if (slotIdx >= 0 && slotIdx !== lastHoveredSlot) {
    // Hovering a building slot
    const entry = buildHotbar.entries[slotIdx]; // may need to expose entries
    if (entry) {
      const buildingDef = ALL_BUILDINGS.find(b => b.type === entry.type);
      const buildingId = buildingIdFromType(entry.type);
      const tierLabel = TIER_NAMES[buildingDef?.tier ?? 0] ?? '';

      // Determine status
      let status = 'Available';
      const unlocked = latestState?.project_manager?.unlocked_buildings ?? [];
      if (unlocked.length > 0 && !unlocked.includes(buildingId)) {
        status = 'Locked';
      }
      // TODO: check if already built (entity exists in entityMap)

      const slotScreenX = hotbarBounds.x + PADDING + slotIdx * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
      const slotScreenY = hotbarBounds.y;

      hotbarTooltip.show(
        slotScreenX, slotScreenY,
        buildingDef?.name ?? entry.name,
        entry.cost,
        buildingDef?.description ?? '',
        tierLabel,
        status,
      );
    }
    lastHoveredSlot = slotIdx;
  } else if (slotIdx === -2) {
    // Hovering the "+" button — hide tooltip or show "Open building browser"
    hotbarTooltip.hide();
    lastHoveredSlot = -2;
  } else if (slotIdx === -1 && lastHoveredSlot !== -1) {
    hotbarTooltip.hide();
    lastHoveredSlot = -1;
  }
});
```

Note: You'll need to either expose the `entries` array on BuildHotbar (make it public), or add a `getEntry(index: number): HotbarEntry | null` method. Also import SLOT_W, SLOT_GAP, and PADDING from build-hotbar or use the hotbar's bounds directly.

A cleaner approach: add a method to BuildHotbar that returns the screen-space center position of a slot:

```typescript
getSlotScreenCenter(index: number): { x: number; y: number } | null
```

**Step 5: Hide tooltip when menus open**

In the menu-blocking section or when a menu opens, call `hotbarTooltip.hide()`.

**Step 6: Verify compilation**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

**Step 7: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: wire hotbar tooltip and '+' button to building browser"
```

---

### Task 7: Final Build Verification

**Step 1: Full client build**

Run: `cd client && npm run build`
Expected: Builds successfully

**Step 2: Full server build**

Run: `cd server && cargo build`
Expected: Builds successfully

**Step 3: Manual test**

1. Start server: `cd server && cargo run`
2. Start client: `cd client && npm run dev`
3. Open browser, click Play
4. Press B — building browser should open showing Tier 1 buildings in a grid
5. Press Right arrow — should change to Tier 2 page
6. Navigate with arrow keys through the grid
7. Locked buildings should appear grey with [LOCKED]
8. Press Enter on an unlocked building — should enter placement mode
9. Click to place — building should be placed
10. Press Escape — browser should close
11. Press 0 — browser should open
12. Click "+" button on hotbar — browser should open
13. Hover over hotbar slots — tooltip should appear with building details
14. Move mouse away — tooltip should disappear

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete building browser with pagination, hotbar tooltips, and '+' button"
```
