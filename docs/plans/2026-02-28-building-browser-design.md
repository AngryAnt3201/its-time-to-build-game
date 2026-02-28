# Building Browser & Hotbar Tooltips Design

Replace the old vertical build menu with a paginated building browser showing all 30+ buildings organized by tier. Add a "+" button to the hotbar to open it, and hover tooltips on hotbar slots.

## Building Browser

A new PixiJS overlay component (`BuildingBrowser`) that replaces the old `BuildMenu`.

### Pagination

One tier per page:
- Page 1: "TIER 1 — HUT ERA" — Pylon, ComputeFarm, and the 7 Tier 1 webapp buildings (9 cards)
- Page 2: "TIER 2 — OUTPOST ERA" — 8 buildings
- Page 3: "TIER 3 — VILLAGE ERA" — 9 buildings
- Page 4: "TIER 4 — NETWORK ERA" — 6 buildings

Infrastructure buildings (Pylon, ComputeFarm) appear on page 1 as they're core starting buildings.

### Card Grid

4 columns, cards ~110x70px. Each card shows:
- Building name
- Token cost with diamond icon
- Locked buildings: greyed out text, "[LOCKED]" label, unselectable

### Navigation

- Left/Right arrows (or A/D) to change pages
- Up/Down/Left/Right to navigate within the grid
- Enter to select and enter placement mode
- Escape or B to close

### Layout

~500px wide, centered on screen. Tier header at top, page indicator at bottom ("Page 1/4"), arrow indicators for prev/next page.

### Data Source

All building data comes from the `buildings_manifest.json` definitions already loaded by the build system. The browser needs the full list of buildings across all tiers, not just the hardcoded Tier 1 list.

## Hotbar Changes

### "+" Button

An extra slot at position 8 (after the 7 existing slots). Styled with a dotted border and "+" symbol in muted color. Clicking it or pressing `0` opens the building browser.

### Static Quick-Access

The hotbar remains a static 7-slot quick-access bar for common buildings. The "+" button is the gateway to the full catalog.

## Hotbar Tooltips

HTML div tooltip (not PixiJS) that appears above the hovered hotbar slot on mouse hover.

Shows:
- Building name (gold, 14px)
- Token cost
- 1-line description
- Tier label (e.g., "Tier 1 — Hut Era")
- Status: "Available" / "Locked" / "Already Built"

Positioned directly above the hovered slot. Dark background with gold border matching the game aesthetic. Disappears when mouse leaves the slot.

## What Gets Replaced

The old `BuildMenu` class (vertical list in `build-menu.ts`) is replaced by the new `BuildingBrowser`. The `B` key and the new "+" hotbar button both open the building browser. The old `build-menu.ts` file is rewritten.

## Files Affected

- Rewrite: `client/src/ui/build-menu.ts` → new `BuildingBrowser` component
- Modify: `client/src/ui/build-hotbar.ts` → add "+" button, tooltip support
- Create: `client/src/ui/hotbar-tooltip.ts` → HTML tooltip component
- Modify: `client/src/main.tsx` → wire new browser, tooltip mouse events
