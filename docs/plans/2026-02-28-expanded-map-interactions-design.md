# Expanded Map Hover Tooltips & Zoom Design

## Overview

Add hover tooltips and zoom controls to the expanded minimap view so players can identify entities and navigate the map at different scales.

## Tooltip

A PixiJS `tooltipContainer` (separate from minimap container, added to top-level `uiContainer` for z-ordering). Matches equipment HUD tooltip style exactly.

### Styling

- Background: `0x0d0b08, alpha 0.94`, rounded rect, `0x3a3020` border
- Corner brackets: `0xd4a017, alpha 0.35`, size 6
- Width: 230px, dynamic height
- Follows cursor with 16px right / 20px up offset

### Content Layout

- **Name** (amber `0xd4a017`, bold 12px): Entity name — agent name, building type, or rogue type
- **Subtitle** (italic 10px, `0x8a7a5a`): Tier for agents, construction % for buildings, level stars for rogues
- **Description** (grey 10px, `0x9a9a8a`): State info — current state, HP, etc.
- **Stat line** (green 9px, `0x6a8a6a`): Key stats — HP/morale for agents, HP/construction for buildings, HP/level for rogues
- **Player tooltip**: Shows "Player" with position

### Hit Detection

On `pointermove` over expanded map:
1. Convert screen coords to tile coords using current zoom/offset
2. Search `allEntities` for closest entity within 3 tiles
3. Show/hide tooltip accordingly
4. Also check proximity to player position

## Zoom

- Controls: Scroll wheel + `+`/`-` keys (expanded mode only)
- Range: `tileScale` from 0.5 (zoomed in) to 4 (zoomed out)
- Steps: Multiply/divide by 1.25 per step
- Default: 1.0 (current expanded default)
- Effect: Changes `tileScale` in `redraw()` — no other rendering changes
- Zoom indicator: Small text in bottom-right of map panel showing "1.0x"

## Integration Points

- `minimap.tooltipContainer` added to `uiContainer` in `main.tsx`
- Mouse events on minimap container when expanded
- Scroll wheel event on canvas, gated by `minimap.expanded`
- `+`/`-` key handling alongside `M` key block in main.tsx
- Tooltip hidden when closing expanded mode
