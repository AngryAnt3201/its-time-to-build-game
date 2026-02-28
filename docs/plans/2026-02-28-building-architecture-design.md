# Building Architecture Design

Buildings in the game represent real code projects. Each building (except Pylons) maps to a webapp with its own directory, dev server, and in-game iframe preview. Agents will eventually write code in these directories.

## Architecture: Project Manager Module

A dedicated `server/src/project/` module owns all project lifecycle concerns, separate from the ECS game simulation.

```
server/src/project/
  mod.rs          — ProjectManager struct, public API
  manifest.rs     — Manifest parsing & building definitions
  scaffold.rs     — Directory creation & Vite scaffold initialization
  process.rs      — Child process spawning, killing, health checks
  ports.rs        — Port assignment & availability checking
```

### ProjectManager

```rust
pub struct ProjectManager {
    base_dir: PathBuf,
    manifest: BuildingsManifest,
    running_processes: HashMap<BuildingId, ChildProcess>,
    unlocked_buildings: HashSet<BuildingId>,
    initialized: bool,
}
```

**API surface:**
- `init(base_dir)` — Create all 30 building directories with Vite + React scaffolds
- `reset()` — Wipe and recreate all directories
- `start_dev_server(id)` — Spawn `npm run dev -- --port {port}`, return port
- `stop_dev_server(id)` — Kill the child process
- `get_server_status(id)` — NotInitialized / Ready / Running(port) / Error(msg)
- `unlock_building(id)` / `is_unlocked(id)` — Blueprint system
- `assign_agent(building_id, agent_id)` — Stub for future LLM code-writing
- `unassign_agent(building_id, agent_id)`

### Process Management

- `tokio::process::Command` spawns async child processes
- Each process gets its fixed port via `-- --port {port}` (Vite CLI arg)
- Stdout/stderr captured for health monitoring
- Processes tracked in HashMap, killed on building destruction or server shutdown
- Health check: periodic HTTP GET to `localhost:{port}`

## Building Manifest

All buildings defined in `buildings_manifest.json` at project root. Single source of truth.

```json
{
  "buildings": [
    {
      "id": "todo_app",
      "name": "Todo App",
      "tier": 1,
      "port": 3101,
      "directory_name": "todo-app",
      "description": "Classic todo list with add/complete/delete",
      "scaffold_template": "react-vite",
      "game_effects": { "passive_income": 2 },
      "cost": 50,
      "build_time": 100,
      "unlocked_by_default": true
    }
  ]
}
```

## Complete Building List

### Tier 1 — Hut Era (unlocked by default)

| Building | Port | Webapp | Dir Name |
|----------|------|--------|----------|
| Todo App | 3101 | Classic todo list | todo-app |
| Calculator | 3102 | Calculator with basic ops | calculator |
| Landing Page | 3103 | Single-page marketing site | landing-page |
| Portfolio Site | 3104 | Portfolio with project cards | portfolio-site |
| Pomodoro Timer | 3105 | Timer with work/break intervals | pomodoro-timer |
| Weather App | 3106 | Weather dashboard (mock data) | weather-app |
| Colour Picker Tool | 3107 | Color picker with hex/rgb | colour-picker-tool |

### Tier 2 — Outpost Era (blueprint required)

| Building | Port | Webapp | Dir Name |
|----------|------|--------|----------|
| REST API | 3111 | API docs viewer / endpoint tester | rest-api |
| Authentication System | 3112 | Login/register with mock auth | authentication-system |
| Database | 3113 | Data table browser/editor | database |
| Admin Dashboard | 3114 | Dashboard with charts and stats | admin-dashboard |
| Search Bar | 3115 | Search interface with filters | search-bar |
| Form with Validation | 3116 | Multi-step form with validation | form-with-validation |
| Markdown Editor | 3117 | Split-pane editor + preview | markdown-editor |
| Budget Tracker | 3118 | Income/expense tracker with charts | budget-tracker |

### Tier 3 — Village Era (rare blueprint required)

| Building | Port | Webapp | Dir Name |
|----------|------|--------|----------|
| CI/CD Pipeline | 3121 | Pipeline stage visualizer | ci-cd-pipeline |
| Unit Test Suite | 3122 | Test runner results dashboard | unit-test-suite |
| CLI Tool | 3123 | Web-based terminal emulator | cli-tool |
| Browser Extension | 3124 | Extension options page | browser-extension |
| Recommendation Engine | 3125 | Content feed with recommendations | recommendation-engine |
| Notification System | 3126 | Notification center / inbox | notification-system |
| Rate Limiter | 3127 | Rate limit config + traffic viz | rate-limiter |
| OAuth Integration | 3128 | OAuth flow demo with providers | oauth-integration |
| Websocket Server | 3129 | Real-time chat application | websocket-server |

### Tier 4 — Network Era (very rare blueprint, multi-agent)

| Building | Port | Webapp | Dir Name |
|----------|------|--------|----------|
| Machine Learning Model | 3131 | ML prediction playground | machine-learning-model |
| Vector Database | 3132 | Similarity search interface | vector-database |
| GraphQL API | 3133 | GraphQL query playground | graphql-api |
| Transformer Model | 3134 | Text generation interface | transformer-model |
| RAG Pipeline | 3135 | Document Q&A search | rag-pipeline |
| Autonomous Agent Framework | 3136 | Agent task board / orchestrator | autonomous-agent-framework |

**Pylons** remain game-only (no code project, multiple allowed).

## Protocol Extensions

### Client → Server (new PlayerAction variants)

```rust
SetProjectDirectory { path: String }
InitializeProjects
ResetProjects
StartDevServer { building_id: EntityId }
StopDevServer { building_id: EntityId }
AssignAgentToProject { agent_id: EntityId, building_id: EntityId }
UnassignAgentFromProject { agent_id: EntityId, building_id: EntityId }
```

### Server → Client (additions to GameStateUpdate)

```rust
// Added to EntityData::Building
project_status: ProjectStatus,  // NotInitialized | Ready | Running(port) | Error(msg)
assigned_agents: Vec<EntityId>,

// New top-level field
project_manager_state: ProjectManagerState {
    base_dir: Option<String>,
    initialized: bool,
    unlocked_buildings: Vec<String>,
}
```

## Client-Side UI

### Settings Modal (existing React TitleScreen)
- New "Project Directory" text input field
- "Initialize Projects" button — scaffolds all 30 dirs (progress indicator)
- "Reset Projects" button — wipes and recreates (confirmation dialog)
- Status indicator: initialized or not

### Building Interaction Overlay
- Click/interact with completed building → HTML overlay panel appears over PixiJS
- Panel shows: building name, description, project status
- Start/Stop Server button
- Iframe loading `http://localhost:{port}` when server is running
- Close button to dismiss
- Resizable panel

### Build Menu Changes
- Locked buildings shown greyed out with "[LOCKED]" label
- Tooltip: "Requires blueprint"
- Only unlocked buildings are placeable

## Blueprint / Unlock System

- All Tier 1 buildings unlocked by default
- Tier 2-4 buildings require blueprint discovery during exploration
- One blueprint = one building unlock (no fragment combining)
- `ProjectManager.unlocked_buildings: HashSet<BuildingId>` is source of truth
- Debug panel: "Unlock All Buildings" toggle for testing

## Directory Lifecycle

### On "Initialize Projects"
1. Server validates base_dir exists and is writable
2. Creates all 30 subdirectories
3. Runs `npm create vite@latest . -- --template react-ts` in each
4. Runs `npm install` in each
5. Writes README.md with building description in each
6. Reports progress to client (percentage/building name)

### On "Reset Projects"
1. Confirmation dialog on client
2. Stops all running dev servers
3. Deletes all 30 subdirectories
4. Re-runs the full initialization flow

### On building construction complete
- Directory already exists from init
- Project status changes from NotInitialized to Ready
- Player can now start the dev server

## Constraints

- One of each building (except Pylons) — enforced in build menu and ECS
- Fixed ports 3101-3136 — deterministic, no collisions
- Vite + React + TypeScript scaffolds for all buildings
- Server manages all processes and directories
- Iframe is an HTML overlay, not embedded in PixiJS canvas

## Not Building Yet

- Agent code-writing (stubbed as assignment tracking only)
- Blueprint fragment combining
- Inter-building project bonuses
- Building-specific scaffold content (all start as identical Vite React templates)
