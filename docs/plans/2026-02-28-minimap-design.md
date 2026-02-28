# Minimap & Expanded Map Design

## Overview

Add a minimap (bottom-right corner) with an expandable fullscreen overlay to show terrain, agents, buildings, rogues, and fog of war.

## Architecture

New file: `client/src/ui/minimap.ts` containing a `Minimap` class.

### Rendering Pipeline

1. Offscreen `<canvas>` element (not in DOM) draws minimap content
2. PixiJS `Texture.from(canvas)` wraps it as a texture
3. Displayed as a `Sprite` inside a styled PixiJS `Container`
4. Texture re-rendered every 30 frames (~2x/sec at 60fps)

### Two Modes

- **Mini mode**: 180x180px panel, bottom-right corner, always visible
- **Expanded mode**: ~60% of screen, centered overlay, toggled via M key or clicking minimap

## Content Layers (drawn in order)

### 1. Terrain

Sample `terrainAt(wx, wy)` per minimap pixel. Color mapping:
- Water: `#2244aa`
- Stone/ground: `#3a3a2a`
- Stone dark: `#2a2a1a`
- Cliffs: `#5a5a4a`

### 2. Fog of War

Client-side tracking of explored tile regions. Unexplored tiles drawn as `#0a0a0a` (near-black). Tiles are marked explored when chunks load around the player.

### 3. Entities

Drawn as colored dots/shapes on top of terrain:
- **Player**: White dot (3px mini, 5px expanded), always centered in mini mode
- **Agents**: Colored by state (same `AGENT_STATE_COLORS` from entities.ts)
- **Buildings**: Gold squares (`0xd4a017`)
- **Rogues**: Red dots

### 4. Viewport Indicator (expanded only)

Rectangle outline showing current camera view bounds.

## Scale

- Mini mode: 1px = 2 tiles (~360x360 tile coverage centered on player)
- Expanded mode: 1px = 1 tile (larger coverage, centered on player)

## Controls

- `M` key: toggle expanded mode (blocked when other overlays open)
- Click on minimap: expand to overlay
- `ESC`: close expanded mode
- View-only (no click-to-navigate)

## Styling

Matches existing HUD conventions:
- Dark background: `0x0d0b08`, alpha 0.82
- Corner brackets: `0xd4a017` amber, alpha 0.4
- Font: IBM Plex Mono (for "MAP" label)
- Rounded rect with 1px border stroke `0x2a2418`

## Integration Points

- `main.tsx`: instantiate `Minimap`, add to `uiContainer`, wire into game loop and resize handler
- Game loop: pass `latestState` entity data + player position each frame
- Keyboard handler: add `M` key binding, `ESC` closes expanded
- Window resize: call `minimap.resize(w, h)`

## Data Dependencies

- `terrainAt()` from `renderer/world.ts` (already exported)
- `AGENT_STATE_COLORS` concept from `renderer/entities.ts`
- Entity positions from `GameStateUpdate.entities_changed`
- Player position from `GameStateUpdate.player.position`
