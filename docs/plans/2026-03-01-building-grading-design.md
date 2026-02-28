# Building Grading System Design

## Overview

Add a 1-6 star grading system for app buildings. Players click "Grade" in the building panel to have an LLM (Claude API) review the app's source code against a per-app-type rubric. The grade determines a token income multiplier.

## Data Model

### Server-side

- `BuildingGrade { stars: u8, reasoning: String, graded_at: u64, grading: bool }`
- Stored in `ProjectManager::building_grades: HashMap<String, BuildingGrade>`
- `GradingService` holds the Anthropic API key (set via in-game `SetAnthropicApiKey` action)

### Protocol additions

- `PlayerAction::GradeBuilding { building_id: String }`
- `PlayerAction::SetAnthropicApiKey { key: String }`
- `ServerMessage::GradeResult { building_id: String, stars: u8, reasoning: String }`
- `ProjectManagerState` gains `building_grades: HashMap<String, BuildingGradeState>` where `BuildingGradeState { stars: u8, reasoning: String, grading: bool }`

## Token Economy

Grade multipliers applied to base income per building type:

| Stars | Multiplier |
|-------|-----------|
| 0 | 0x (broken code) |
| 1 | 0.5x |
| 2 | 1x |
| 3 | 2x |
| 4 | 3x |
| 5 | 5x |
| 6 | 10x |
| Ungraded | 1x (default) |

## LLM Grading Service

- New module: `server/src/grading/mod.rs`
- Reads `.tsx`, `.ts`, `.css`, `.html` files from project directory (ignores `node_modules`, `dist`)
- Sends code + per-app-type rubric to Claude API (claude-sonnet-4-6)
- Returns structured JSON: `{ "stars": 1-6, "reasoning": "..." }`
- Async, non-blocking (tokio::spawn)
- 0 stars if LLM detects syntax errors or broken code
- Keeps previous grade if API call fails

## Grading Rubrics (per app type)

Each of the 11 app buildings has a tailored rubric. General pattern:

- 1 star: Bare minimum, basic HTML, no styling
- 2 stars: Functional with basic styling
- 3 stars: Clean components, proper state, responsive
- 4 stars: Advanced features (drag-and-drop, persistence, etc.)
- 5 stars: Animations (framer-motion), dark mode, keyboard shortcuts
- 6 stars: Production-grade with micro-interactions, accessibility, offline support, performance

## Client UI

### Building Panel (large modal)
- "Grade" button in header bar, next to Start/Stop
- Grade display row below header: filled/empty star icons + reasoning text
- Loading state during grading
- Button enabled when dev server is Ready or Running

### Building Toolbar (hover popup)
- Small star rating display next to status badge
- No grade button (panel only)

## Files Changed

### New
- `server/src/grading/mod.rs` - GradingService + Claude API
- `server/src/grading/rubrics.rs` - Per-app-type rubrics

### Modified
- `server/src/protocol.rs` - New actions, messages, state fields
- `server/src/project/mod.rs` - Store grades
- `server/src/ecs/systems/economy.rs` - Apply multipliers
- `server/src/main.rs` - Wire up grading service, handle actions
- `client/src/ui/building-panel.ts` - Grade button, stars, reasoning
- `client/src/ui/building-toolbar.ts` - Star rating display
- `client/src/main.tsx` - Handle GradeResult message

## Trigger

- On-demand only: player clicks "Grade" button
- Can re-grade anytime after code changes
