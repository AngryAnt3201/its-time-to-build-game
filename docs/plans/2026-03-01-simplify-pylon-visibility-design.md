# Simplify Pylon / Visibility System

## Problem
The 5-layer gradient lighting system causes significant performance issues. The blind mode UI for terminals without pylon coverage is complex and unnecessary.

## Design

### Terminal without pylon
- Replace blind mode with a 10-second countdown overlay
- Banner: "NO PYLON SIGNAL - Closing in Xs..."
- Countdown decrements each second
- At 0, auto-close the terminal
- Remove: blind response area, blind input, blind send button, blind mode toggling
- If a pylon is built during countdown, cancel the countdown and show full terminal

### Terminal with pylon
- No changes — full xterm.js terminal as before

### Lighting
- Remove 5-layer gradient system (layers, rings, cutouts)
- Keep only the base darkness layer (single full-screen 0.50 alpha overlay)
- Remove `BUILDING_LIGHT_RADIUS` map and light collection loop in main.tsx
- Remove `updateLights()` / `updateTorchLight()` methods — only `rebuildDarkness()` needed
- Keep `LightingRenderer` class but strip it to just the base darkness overlay
- Keep `resize()` and `setFullLight()` for debug toggle

### What stays
- Server-side fog of war (fog.rs) unchanged
- `isBuildingNearPylon()` check (still needed for terminal gating)
- Pylon as a building/progression requirement

## Files to modify
1. `client/src/renderer/lighting.ts` — strip to base darkness only
2. `client/src/ui/terminal-overlay.ts` — replace blind mode with countdown + auto-close
3. `client/src/main.tsx` — remove light collection loop, simplify lighting update
