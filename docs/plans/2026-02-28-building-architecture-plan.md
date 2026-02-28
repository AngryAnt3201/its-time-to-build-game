# Building Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Buildings represent real code projects — each gets a Vite+React directory, a manageable dev server, an in-game iframe overlay, and a blueprint unlock system.

**Architecture:** Dedicated `server/src/project/` module owns directory scaffolding, child process lifecycle, and port management. The ECS building system bridges to the ProjectManager on construction completion. Client gets a new overlay panel for interacting with building projects and settings modal extensions for directory configuration.

**Tech Stack:** Rust (tokio async, std::process), TypeScript/React (settings), PixiJS (overlay panel), Vite+React-TS (scaffolded projects)

---

### Task 1: Create Buildings Manifest

**Files:**
- Create: `buildings_manifest.json`

**Step 1: Write the manifest file**

Create `buildings_manifest.json` at project root with all 30 buildings. Each entry needs: `id`, `name`, `tier`, `port`, `directory_name`, `description`, `cost`, `build_time`, `unlocked_by_default`.

```json
{
  "buildings": [
    { "id": "todo_app", "name": "Todo App", "tier": 1, "port": 3101, "directory_name": "todo-app", "description": "Classic todo list with add/complete/delete", "cost": 50, "build_time": 100, "unlocked_by_default": true },
    { "id": "calculator", "name": "Calculator", "tier": 1, "port": 3102, "directory_name": "calculator", "description": "Calculator with basic operations", "cost": 60, "build_time": 80, "unlocked_by_default": true },
    { "id": "landing_page", "name": "Landing Page", "tier": 1, "port": 3103, "directory_name": "landing-page", "description": "Single-page marketing site", "cost": 40, "build_time": 60, "unlocked_by_default": true },
    { "id": "portfolio_site", "name": "Portfolio Site", "tier": 1, "port": 3104, "directory_name": "portfolio-site", "description": "Personal portfolio with project cards", "cost": 70, "build_time": 120, "unlocked_by_default": true },
    { "id": "pomodoro_timer", "name": "Pomodoro Timer", "tier": 1, "port": 3105, "directory_name": "pomodoro-timer", "description": "Timer with work/break intervals", "cost": 55, "build_time": 90, "unlocked_by_default": true },
    { "id": "weather_app", "name": "Weather App", "tier": 1, "port": 3106, "directory_name": "weather-app", "description": "Weather dashboard with mock data", "cost": 65, "build_time": 110, "unlocked_by_default": true },
    { "id": "colour_picker_tool", "name": "Colour Picker Tool", "tier": 1, "port": 3107, "directory_name": "colour-picker-tool", "description": "Color picker with hex/rgb output", "cost": 45, "build_time": 70, "unlocked_by_default": true },

    { "id": "rest_api", "name": "REST API", "tier": 2, "port": 3111, "directory_name": "rest-api", "description": "API docs viewer and endpoint tester", "cost": 150, "build_time": 200, "unlocked_by_default": false },
    { "id": "authentication_system", "name": "Authentication System", "tier": 2, "port": 3112, "directory_name": "authentication-system", "description": "Login and register form with mock auth", "cost": 180, "build_time": 250, "unlocked_by_default": false },
    { "id": "database", "name": "Database", "tier": 2, "port": 3113, "directory_name": "database", "description": "Data table browser and editor", "cost": 200, "build_time": 300, "unlocked_by_default": false },
    { "id": "admin_dashboard", "name": "Admin Dashboard", "tier": 2, "port": 3114, "directory_name": "admin-dashboard", "description": "Dashboard with charts and stats", "cost": 170, "build_time": 220, "unlocked_by_default": false },
    { "id": "search_bar", "name": "Search Bar", "tier": 2, "port": 3115, "directory_name": "search-bar", "description": "Search interface with filters and results", "cost": 130, "build_time": 180, "unlocked_by_default": false },
    { "id": "form_with_validation", "name": "Form with Validation", "tier": 2, "port": 3116, "directory_name": "form-with-validation", "description": "Multi-step form with real-time validation", "cost": 140, "build_time": 190, "unlocked_by_default": false },
    { "id": "markdown_editor", "name": "Markdown Editor", "tier": 2, "port": 3117, "directory_name": "markdown-editor", "description": "Split-pane markdown editor with preview", "cost": 160, "build_time": 240, "unlocked_by_default": false },
    { "id": "budget_tracker", "name": "Budget Tracker", "tier": 2, "port": 3118, "directory_name": "budget-tracker", "description": "Income and expense tracker with charts", "cost": 155, "build_time": 210, "unlocked_by_default": false },

    { "id": "ci_cd_pipeline", "name": "CI/CD Pipeline", "tier": 3, "port": 3121, "directory_name": "ci-cd-pipeline", "description": "Pipeline stage visualizer", "cost": 300, "build_time": 400, "unlocked_by_default": false },
    { "id": "unit_test_suite", "name": "Unit Test Suite", "tier": 3, "port": 3122, "directory_name": "unit-test-suite", "description": "Test runner results dashboard", "cost": 280, "build_time": 350, "unlocked_by_default": false },
    { "id": "cli_tool", "name": "CLI Tool", "tier": 3, "port": 3123, "directory_name": "cli-tool", "description": "Web-based terminal emulator", "cost": 320, "build_time": 380, "unlocked_by_default": false },
    { "id": "browser_extension", "name": "Browser Extension", "tier": 3, "port": 3124, "directory_name": "browser-extension", "description": "Extension options page", "cost": 260, "build_time": 320, "unlocked_by_default": false },
    { "id": "recommendation_engine", "name": "Recommendation Engine", "tier": 3, "port": 3125, "directory_name": "recommendation-engine", "description": "Content feed with recommendations", "cost": 350, "build_time": 450, "unlocked_by_default": false },
    { "id": "notification_system", "name": "Notification System", "tier": 3, "port": 3126, "directory_name": "notification-system", "description": "Notification center and inbox", "cost": 270, "build_time": 340, "unlocked_by_default": false },
    { "id": "rate_limiter", "name": "Rate Limiter", "tier": 3, "port": 3127, "directory_name": "rate-limiter", "description": "Rate limit config and traffic visualizer", "cost": 290, "build_time": 360, "unlocked_by_default": false },
    { "id": "oauth_integration", "name": "OAuth Integration", "tier": 3, "port": 3128, "directory_name": "oauth-integration", "description": "OAuth flow demo with providers", "cost": 310, "build_time": 400, "unlocked_by_default": false },
    { "id": "websocket_server", "name": "Websocket Server", "tier": 3, "port": 3129, "directory_name": "websocket-server", "description": "Real-time chat application", "cost": 340, "build_time": 420, "unlocked_by_default": false },

    { "id": "machine_learning_model", "name": "Machine Learning Model", "tier": 4, "port": 3131, "directory_name": "machine-learning-model", "description": "ML prediction playground", "cost": 500, "build_time": 600, "unlocked_by_default": false },
    { "id": "vector_database", "name": "Vector Database", "tier": 4, "port": 3132, "directory_name": "vector-database", "description": "Similarity search interface", "cost": 480, "build_time": 550, "unlocked_by_default": false },
    { "id": "graphql_api", "name": "GraphQL API", "tier": 4, "port": 3133, "directory_name": "graphql-api", "description": "GraphQL query playground", "cost": 450, "build_time": 520, "unlocked_by_default": false },
    { "id": "transformer_model", "name": "Transformer Model", "tier": 4, "port": 3134, "directory_name": "transformer-model", "description": "Text generation interface", "cost": 800, "build_time": 900, "unlocked_by_default": false },
    { "id": "rag_pipeline", "name": "RAG Pipeline", "tier": 4, "port": 3135, "directory_name": "rag-pipeline", "description": "Document Q&A search", "cost": 550, "build_time": 650, "unlocked_by_default": false },
    { "id": "autonomous_agent_framework", "name": "Autonomous Agent Framework", "tier": 4, "port": 3136, "directory_name": "autonomous-agent-framework", "description": "Agent task board and orchestrator", "cost": 600, "build_time": 700, "unlocked_by_default": false }
  ]
}
```

**Step 2: Verify manifest is valid JSON**

Run: `cat buildings_manifest.json | python3 -m json.tool > /dev/null && echo "Valid JSON"`
Expected: `Valid JSON`

**Step 3: Commit**

```bash
git add buildings_manifest.json
git commit -m "feat: add buildings manifest with all 30 building definitions"
```

---

### Task 2: Server — Project Module Structure

**Files:**
- Create: `server/src/project/mod.rs`
- Create: `server/src/project/manifest.rs`
- Create: `server/src/project/scaffold.rs`
- Create: `server/src/project/process.rs`
- Modify: `server/src/main.rs` — add `mod project;`
- Modify: `server/src/game/mod.rs` — no changes needed (project is a sibling module)

**Step 1: Create project module directory**

Run: `mkdir -p server/src/project`

**Step 2: Write mod.rs — ProjectManager struct and public API**

Create `server/src/project/mod.rs`:

```rust
pub mod manifest;
pub mod process;
pub mod scaffold;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use manifest::BuildingsManifest;
use process::DevServerProcess;

/// Status of a building's project on disk and its dev server
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum ProjectStatus {
    /// Base dir not set or projects not initialized
    NotInitialized,
    /// Directory exists with scaffold, ready to start
    Ready,
    /// Dev server running on this port
    Running(u16),
    /// Dev server or scaffold errored
    Error(String),
}

/// Manages all building code project directories and dev server processes.
pub struct ProjectManager {
    /// User-selected base directory for all project directories
    pub base_dir: Option<PathBuf>,
    /// Parsed building definitions from manifest
    pub manifest: BuildingsManifest,
    /// Currently running dev server processes, keyed by building ID
    running_processes: HashMap<String, DevServerProcess>,
    /// Set of building IDs unlocked via blueprints
    unlocked_buildings: HashSet<String>,
    /// Whether projects have been initialized (dirs created + scaffolded)
    pub initialized: bool,
    /// Per-building project status
    pub statuses: HashMap<String, ProjectStatus>,
    /// Agent assignments (building_id -> vec of agent entity IDs)
    pub agent_assignments: HashMap<String, Vec<u64>>,
}

impl ProjectManager {
    pub fn new() -> Self {
        let manifest = BuildingsManifest::load_from_file("buildings_manifest.json")
            .unwrap_or_else(|e| {
                tracing::warn!("Failed to load buildings manifest: {e}. Using empty manifest.");
                BuildingsManifest::default()
            });

        // Pre-populate unlocked buildings from manifest defaults
        let unlocked: HashSet<String> = manifest
            .buildings
            .iter()
            .filter(|b| b.unlocked_by_default)
            .map(|b| b.id.clone())
            .collect();

        let mut statuses = HashMap::new();
        for b in &manifest.buildings {
            statuses.insert(b.id.clone(), ProjectStatus::NotInitialized);
        }

        Self {
            base_dir: None,
            manifest,
            running_processes: HashMap::new(),
            unlocked_buildings: unlocked,
            initialized: false,
            statuses,
            agent_assignments: HashMap::new(),
        }
    }

    /// Set the base directory for all project directories.
    pub fn set_base_dir(&mut self, path: String) -> Result<(), String> {
        let p = PathBuf::from(&path);
        if !p.exists() {
            return Err(format!("Directory does not exist: {path}"));
        }
        if !p.is_dir() {
            return Err(format!("Path is not a directory: {path}"));
        }
        self.base_dir = Some(p);
        tracing::info!("Project base directory set to: {path}");
        Ok(())
    }

    /// Initialize all project directories with Vite+React scaffolds.
    /// Returns progress messages for each building.
    pub async fn initialize_projects(&mut self) -> Result<Vec<String>, String> {
        let base = self.base_dir.as_ref().ok_or("Base directory not set")?;
        let mut messages = Vec::new();

        for building in &self.manifest.buildings {
            let dir = base.join(&building.directory_name);
            match scaffold::scaffold_project(&dir, &building.name, &building.description).await {
                Ok(msg) => {
                    self.statuses.insert(building.id.clone(), ProjectStatus::Ready);
                    messages.push(msg);
                }
                Err(e) => {
                    let err_msg = format!("Failed to scaffold {}: {e}", building.name);
                    self.statuses.insert(building.id.clone(), ProjectStatus::Error(e));
                    messages.push(err_msg);
                }
            }
        }

        self.initialized = true;
        Ok(messages)
    }

    /// Wipe all project directories and re-scaffold.
    pub async fn reset_projects(&mut self) -> Result<Vec<String>, String> {
        let base = self.base_dir.as_ref().ok_or("Base directory not set")?;

        // Stop all running dev servers first
        self.stop_all_servers().await;

        // Delete all building directories
        for building in &self.manifest.buildings {
            let dir = base.join(&building.directory_name);
            if dir.exists() {
                if let Err(e) = std::fs::remove_dir_all(&dir) {
                    tracing::warn!("Failed to remove {}: {e}", dir.display());
                }
            }
        }

        self.initialized = false;
        for (_, status) in self.statuses.iter_mut() {
            *status = ProjectStatus::NotInitialized;
        }

        // Re-scaffold
        self.initialize_projects().await
    }

    /// Start the dev server for a specific building.
    pub async fn start_dev_server(&mut self, building_id: &str) -> Result<u16, String> {
        let base = self.base_dir.as_ref().ok_or("Base directory not set")?;
        let building = self.manifest.get_building(building_id)
            .ok_or(format!("Unknown building: {building_id}"))?;
        let dir = base.join(&building.directory_name);

        if !dir.exists() {
            return Err(format!("Project directory does not exist: {}", dir.display()));
        }

        // Stop existing process if any
        if self.running_processes.contains_key(building_id) {
            self.stop_dev_server(building_id).await?;
        }

        let port = building.port;
        let proc = process::start_dev_server(&dir, port).await?;
        self.running_processes.insert(building_id.to_string(), proc);
        self.statuses.insert(building_id.to_string(), ProjectStatus::Running(port));

        tracing::info!("Started dev server for {} on port {port}", building.name);
        Ok(port)
    }

    /// Stop the dev server for a specific building.
    pub async fn stop_dev_server(&mut self, building_id: &str) -> Result<(), String> {
        if let Some(mut proc) = self.running_processes.remove(building_id) {
            proc.kill().await;
            self.statuses.insert(building_id.to_string(), ProjectStatus::Ready);
            tracing::info!("Stopped dev server for {building_id}");
        }
        Ok(())
    }

    /// Stop all running dev servers.
    pub async fn stop_all_servers(&mut self) {
        let ids: Vec<String> = self.running_processes.keys().cloned().collect();
        for id in ids {
            let _ = self.stop_dev_server(&id).await;
        }
    }

    /// Get the project status for a building.
    pub fn get_status(&self, building_id: &str) -> ProjectStatus {
        self.statuses
            .get(building_id)
            .cloned()
            .unwrap_or(ProjectStatus::NotInitialized)
    }

    /// Unlock a building via blueprint discovery.
    pub fn unlock_building(&mut self, building_id: &str) {
        self.unlocked_buildings.insert(building_id.to_string());
        tracing::info!("Blueprint unlocked: {building_id}");
    }

    /// Check if a building is unlocked.
    pub fn is_unlocked(&self, building_id: &str) -> bool {
        self.unlocked_buildings.contains(building_id)
    }

    /// Get all unlocked building IDs.
    pub fn get_unlocked_buildings(&self) -> Vec<String> {
        self.unlocked_buildings.iter().cloned().collect()
    }

    /// Unlock all buildings (debug).
    pub fn unlock_all(&mut self) {
        for building in &self.manifest.buildings {
            self.unlocked_buildings.insert(building.id.clone());
        }
    }

    /// Lock all non-default buildings (debug reset).
    pub fn lock_all_non_default(&mut self) {
        self.unlocked_buildings.clear();
        for building in &self.manifest.buildings {
            if building.unlocked_by_default {
                self.unlocked_buildings.insert(building.id.clone());
            }
        }
    }

    /// Assign an agent to a building project (stub for future LLM code-writing).
    pub fn assign_agent(&mut self, building_id: &str, agent_id: u64) {
        self.agent_assignments
            .entry(building_id.to_string())
            .or_default()
            .push(agent_id);
        tracing::info!("Agent {agent_id} assigned to project {building_id}");
    }

    /// Unassign an agent from a building project.
    pub fn unassign_agent(&mut self, building_id: &str, agent_id: u64) {
        if let Some(agents) = self.agent_assignments.get_mut(building_id) {
            agents.retain(|&id| id != agent_id);
        }
    }

    /// Get agents assigned to a building.
    pub fn get_assigned_agents(&self, building_id: &str) -> Vec<u64> {
        self.agent_assignments
            .get(building_id)
            .cloned()
            .unwrap_or_default()
    }

    /// Map a BuildingTypeKind string to a manifest building ID.
    /// The ECS uses PascalCase enum names, the manifest uses snake_case IDs.
    pub fn building_type_to_id(building_type: &str) -> Option<String> {
        // Convert PascalCase to snake_case
        let mut result = String::new();
        for (i, ch) in building_type.chars().enumerate() {
            if ch.is_uppercase() && i > 0 {
                result.push('_');
            }
            result.push(ch.to_lowercase().next().unwrap());
        }
        Some(result)
    }
}
```

**Step 3: Write manifest.rs — Manifest parsing**

Create `server/src/project/manifest.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingDefinition {
    pub id: String,
    pub name: String,
    pub tier: u8,
    pub port: u16,
    pub directory_name: String,
    pub description: String,
    pub cost: i64,
    pub build_time: f32,
    pub unlocked_by_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BuildingsManifest {
    pub buildings: Vec<BuildingDefinition>,
}

impl BuildingsManifest {
    /// Load manifest from a JSON file path.
    pub fn load_from_file(path: impl AsRef<Path>) -> Result<Self, String> {
        let content = std::fs::read_to_string(path.as_ref())
            .map_err(|e| format!("Failed to read manifest: {e}"))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse manifest: {e}"))
    }

    /// Get a building definition by ID.
    pub fn get_building(&self, id: &str) -> Option<&BuildingDefinition> {
        self.buildings.iter().find(|b| b.id == id)
    }

    /// Get all buildings for a specific tier.
    pub fn get_tier(&self, tier: u8) -> Vec<&BuildingDefinition> {
        self.buildings.iter().filter(|b| b.tier == tier).collect()
    }
}
```

**Step 4: Write scaffold.rs — Directory creation and Vite scaffolding**

Create `server/src/project/scaffold.rs`:

```rust
use std::path::Path;
use tokio::process::Command;

/// Scaffold a Vite+React+TypeScript project in the given directory.
/// Creates the directory if it doesn't exist, runs npm create vite and npm install.
pub async fn scaffold_project(
    dir: &Path,
    name: &str,
    description: &str,
) -> Result<String, String> {
    // Create directory if it doesn't exist
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create directory {}: {e}", dir.display()))?;
    }

    // Check if already scaffolded (has package.json)
    if dir.join("package.json").exists() {
        return Ok(format!("{name}: already scaffolded, skipping"));
    }

    // Run npm create vite
    let output = Command::new("npm")
        .args(["create", "vite@latest", ".", "--", "--template", "react-ts"])
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run npm create vite for {name}: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm create vite failed for {name}: {stderr}"));
    }

    // Run npm install
    let output = Command::new("npm")
        .args(["install"])
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run npm install for {name}: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("npm install failed for {name}: {stderr}"));
    }

    // Write a README with the building description
    let readme = format!(
        "# {name}\n\n{description}\n\nThis project was scaffolded by It's Time to Build.\n"
    );
    std::fs::write(dir.join("README.md"), readme)
        .map_err(|e| format!("Failed to write README for {name}: {e}"))?;

    Ok(format!("{name}: scaffolded successfully"))
}
```

**Step 5: Write process.rs — Dev server process management**

Create `server/src/project/process.rs`:

```rust
use std::path::Path;
use tokio::process::{Child, Command};

/// Handle to a running dev server child process.
pub struct DevServerProcess {
    child: Child,
    pub port: u16,
}

impl DevServerProcess {
    /// Kill the dev server process.
    pub async fn kill(&mut self) {
        if let Err(e) = self.child.kill().await {
            tracing::warn!("Failed to kill dev server on port {}: {e}", self.port);
        }
        // Wait for process to fully exit
        let _ = self.child.wait().await;
    }
}

/// Start a Vite dev server in the given directory on the specified port.
pub async fn start_dev_server(dir: &Path, port: u16) -> Result<DevServerProcess, String> {
    let child = Command::new("npm")
        .args(["run", "dev", "--", "--port", &port.to_string(), "--host"])
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start dev server in {}: {e}", dir.display()))?;

    // Give the server a moment to start
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    Ok(DevServerProcess { child, port })
}
```

**Step 6: Register the project module in main.rs**

Modify `server/src/main.rs` — add at the top with other mod declarations:
```rust
mod project;
```

**Step 7: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles with no errors (warnings OK)

**Step 8: Commit**

```bash
git add server/src/project/ server/src/main.rs
git commit -m "feat: add project manager module with manifest, scaffold, and process management"
```

---

### Task 3: Server — Protocol Extensions

**Files:**
- Modify: `server/src/protocol.rs` — add new PlayerAction variants, ProjectStatus, ProjectManagerState

**Step 1: Read current protocol.rs**

Read `server/src/protocol.rs` to see exact current state and line numbers.

**Step 2: Add ProjectStatus and ProjectManagerState to protocol.rs**

Add after the existing type definitions (before PlayerAction enum):

```rust
/// Status of a building's code project
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProjectStatus {
    NotInitialized,
    Ready,
    Running(u16),
    Error(String),
}

/// State of the project manager sent to client each tick
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManagerState {
    pub base_dir: Option<String>,
    pub initialized: bool,
    pub unlocked_buildings: Vec<String>,
    pub building_statuses: std::collections::HashMap<String, ProjectStatus>,
}
```

**Step 3: Add new PlayerAction variants**

Add these variants to the `PlayerAction` enum:

```rust
// Project management actions
SetProjectDirectory { path: String },
InitializeProjects,
ResetProjects,
StartDevServer { building_id: String },
StopDevServer { building_id: String },
AssignAgentToProject { agent_id: u64, building_id: String },
UnassignAgentFromProject { agent_id: u64, building_id: String },
DebugUnlockAllBuildings,
DebugLockAllBuildings,
UnlockBuilding { building_id: String },
```

**Step 4: Add project_manager field to GameStateUpdate**

Add to the `GameStateUpdate` struct:

```rust
pub project_manager: Option<ProjectManagerState>,
```

**Step 5: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles (warnings about unused fields OK)

**Step 6: Commit**

```bash
git add server/src/protocol.rs
git commit -m "feat: add project management protocol types and actions"
```

---

### Task 4: Server — Wire Up Actions in Game Loop

**Files:**
- Modify: `server/src/main.rs` — initialize ProjectManager, handle new actions, include project state in updates

**Step 1: Read main.rs for exact insertion points**

Read `server/src/main.rs` to find the exact action match block and state update assembly.

**Step 2: Initialize ProjectManager after world creation**

After world initialization (around line 65-66), add:

```rust
let mut project_manager = project::ProjectManager::new();
```

**Step 3: Add action handlers in the input processing block**

In the `match input.action` block (lines 114-188), add new match arms before the catch-all:

```rust
PlayerAction::SetProjectDirectory { path } => {
    match project_manager.set_base_dir(path.clone()) {
        Ok(()) => log_entries.push(format!("[system] Project directory set to: {path}")),
        Err(e) => log_entries.push(format!("[system] Error: {e}")),
    }
}
PlayerAction::InitializeProjects => {
    log_entries.push("[system] Initializing projects... this may take a while.".to_string());
    match project_manager.initialize_projects().await {
        Ok(msgs) => {
            for msg in msgs {
                log_entries.push(format!("[system] {msg}"));
            }
            log_entries.push("[system] All projects initialized.".to_string());
        }
        Err(e) => log_entries.push(format!("[system] Init failed: {e}")),
    }
}
PlayerAction::ResetProjects => {
    log_entries.push("[system] Resetting all projects...".to_string());
    match project_manager.reset_projects().await {
        Ok(msgs) => {
            for msg in msgs {
                log_entries.push(format!("[system] {msg}"));
            }
            log_entries.push("[system] All projects reset.".to_string());
        }
        Err(e) => log_entries.push(format!("[system] Reset failed: {e}")),
    }
}
PlayerAction::StartDevServer { building_id } => {
    match project_manager.start_dev_server(&building_id).await {
        Ok(port) => log_entries.push(format!("[system] Dev server started on port {port}")),
        Err(e) => log_entries.push(format!("[system] Failed to start server: {e}")),
    }
}
PlayerAction::StopDevServer { building_id } => {
    match project_manager.stop_dev_server(&building_id).await {
        Ok(()) => log_entries.push(format!("[system] Dev server stopped for {building_id}")),
        Err(e) => log_entries.push(format!("[system] Failed to stop server: {e}")),
    }
}
PlayerAction::AssignAgentToProject { agent_id, building_id } => {
    project_manager.assign_agent(&building_id, agent_id);
    log_entries.push(format!("[system] Agent assigned to {building_id}"));
}
PlayerAction::UnassignAgentFromProject { agent_id, building_id } => {
    project_manager.unassign_agent(&building_id, agent_id);
    log_entries.push(format!("[system] Agent unassigned from {building_id}"));
}
PlayerAction::DebugUnlockAllBuildings => {
    project_manager.unlock_all();
    log_entries.push("[system] All buildings unlocked.".to_string());
}
PlayerAction::DebugLockAllBuildings => {
    project_manager.lock_all_non_default();
    log_entries.push("[system] Non-default buildings locked.".to_string());
}
PlayerAction::UnlockBuilding { building_id } => {
    project_manager.unlock_building(&building_id);
    log_entries.push(format!("[system] Blueprint unlocked: {building_id}"));
}
```

**Step 4: Include project manager state in GameStateUpdate**

In the GameStateUpdate assembly (around lines 369-388), add:

```rust
project_manager: Some(crate::protocol::ProjectManagerState {
    base_dir: project_manager.base_dir.as_ref().map(|p| p.to_string_lossy().to_string()),
    initialized: project_manager.initialized,
    unlocked_buildings: project_manager.get_unlocked_buildings(),
    building_statuses: project_manager.statuses.clone().into_iter().collect(),
}),
```

Note: The `ProjectStatus` in `project/mod.rs` and `protocol.rs` are separate types with the same shape. Use the protocol version for serialization by converting, or unify them into one type in `protocol.rs` and import it in the project module.

**Step 5: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles successfully

**Step 6: Commit**

```bash
git add server/src/main.rs
git commit -m "feat: wire project manager actions into game loop"
```

---

### Task 5: Client — Protocol Type Extensions

**Files:**
- Modify: `client/src/network/protocol.ts` — add new types and action variants

**Step 1: Read current protocol.ts**

Read `client/src/network/protocol.ts` for exact types.

**Step 2: Add ProjectStatus type**

Add after the existing type definitions:

```typescript
// ── Project Management ──────────────────────────────

export type ProjectStatus =
  | "NotInitialized"
  | { Ready: null }
  | { Running: number }   // port number
  | { Error: string };

export interface ProjectManagerState {
  base_dir: string | null;
  initialized: boolean;
  unlocked_buildings: string[];
  building_statuses: Record<string, ProjectStatus>;
}
```

**Step 3: Add project_manager field to GameStateUpdate**

Add to the `GameStateUpdate` interface:

```typescript
project_manager: ProjectManagerState | null;
```

**Step 4: Add new PlayerAction variants**

Add to the `PlayerAction` type:

```typescript
| { SetProjectDirectory: { path: string } }
| "InitializeProjects"
| "ResetProjects"
| { StartDevServer: { building_id: string } }
| { StopDevServer: { building_id: string } }
| { AssignAgentToProject: { agent_id: number; building_id: string } }
| { UnassignAgentFromProject: { agent_id: number; building_id: string } }
| "DebugUnlockAllBuildings"
| "DebugLockAllBuildings"
| { UnlockBuilding: { building_id: string } }
```

**Step 5: Commit**

```bash
git add client/src/network/protocol.ts
git commit -m "feat: add project management types to client protocol"
```

---

### Task 6: Client — Settings Modal Integration

**Files:**
- Modify: `client/src/ui/title-screen/SettingsModal.tsx` — add project directory input, init/reset buttons
- Modify: `client/src/utils/api-keys.ts` — add project directory storage (or create a new utils file)

**Step 1: Read SettingsModal.tsx and api-keys.ts**

Read both files for exact current code.

**Step 2: Add project directory storage to api-keys.ts**

Add to the KEYS object and extend utility functions, or create a new `client/src/utils/project-settings.ts`:

```typescript
const PROJECT_DIR_KEY = "project_base_dir";

export function getProjectDir(): string | null {
  return localStorage.getItem(PROJECT_DIR_KEY);
}

export function setProjectDir(dir: string): void {
  localStorage.setItem(PROJECT_DIR_KEY, dir);
}
```

**Step 3: Add project directory section to SettingsModal**

Add to SettingsModal.tsx state:

```typescript
const [projectDir, setProjectDirState] = useState('');
```

In the `useEffect` that loads on open, load the project dir:

```typescript
setProjectDirState(getProjectDir() || '');
```

Add a new section in the modal render, after the API key inputs:

```tsx
<div className="settings-section">
  <h3>Project Directory</h3>
  <p className="settings-hint">Base directory where building code projects will be created</p>
  <input
    type="text"
    value={projectDir}
    onChange={(e) => setProjectDirState(e.target.value)}
    placeholder="/path/to/your/projects"
    className="settings-input"
  />
  <div className="settings-actions">
    <button
      className="settings-btn"
      onClick={() => {
        setProjectDir(projectDir);
        // Send to server
        onProjectAction?.({ SetProjectDirectory: { path: projectDir } });
      }}
    >
      Set Directory
    </button>
    <button
      className="settings-btn settings-btn-primary"
      onClick={() => onProjectAction?.("InitializeProjects")}
    >
      Initialize Projects
    </button>
    <button
      className="settings-btn settings-btn-danger"
      onClick={() => {
        if (confirm("This will delete ALL project files and re-scaffold. Are you sure?")) {
          onProjectAction?.("ResetProjects");
        }
      }}
    >
      Reset All Projects
    </button>
  </div>
</div>
```

Add `onProjectAction` to the props interface:

```typescript
interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onClickSound?: () => void;
  onProjectAction?: (action: PlayerAction) => void;
}
```

**Step 4: Wire onProjectAction from TitleScreen through to connection**

The TitleScreen component needs to pass `onProjectAction` down. This callback should send the action to the server via the Connection. Since Connection isn't available until after the game starts, store the project dir in localStorage and send it on game start.

Alternative: the settings modal can also be opened in-game (via a keyboard shortcut or menu). For now, store the dir in localStorage, and send `SetProjectDirectory` + `InitializeProjects` when the game starts if a dir is configured.

In `main.tsx`, after connection is established, check localStorage and send:

```typescript
const savedProjectDir = localStorage.getItem("project_base_dir");
if (savedProjectDir) {
  connection.sendInput({
    tick: 0,
    movement: { x: 0, y: 0 },
    action: { SetProjectDirectory: { path: savedProjectDir } },
    target: null,
  });
}
```

**Step 5: Commit**

```bash
git add client/src/utils/project-settings.ts client/src/ui/title-screen/SettingsModal.tsx client/src/main.tsx
git commit -m "feat: add project directory settings to title screen"
```

---

### Task 7: Client — Building Project Overlay Panel

**Files:**
- Create: `client/src/ui/building-panel.ts` — new PixiJS + HTML overlay panel

**Step 1: Create the building panel**

This is an HTML overlay (not PixiJS) that appears when the player interacts with a completed building. It contains:
- Building name and description
- Project status indicator
- Start/Stop server button
- Iframe showing the running webapp
- Close button

Create `client/src/ui/building-panel.ts`:

```typescript
import type { PlayerAction, ProjectStatus } from "../network/protocol";

export interface BuildingPanelCallbacks {
  onAction: (action: PlayerAction) => void;
  onClose: () => void;
}

export class BuildingPanel {
  private container: HTMLDivElement;
  private iframe: HTMLIFrameElement;
  private statusEl: HTMLSpanElement;
  private toggleBtn: HTMLButtonElement;
  private titleEl: HTMLHeadingElement;
  private descEl: HTMLParagraphElement;

  public visible = false;

  private currentBuildingId: string | null = null;
  private currentPort: number | null = null;
  private callbacks: BuildingPanelCallbacks;

  constructor(callbacks: BuildingPanelCallbacks) {
    this.callbacks = callbacks;

    // Create the overlay container
    this.container = document.createElement("div");
    this.container.id = "building-panel";
    this.container.style.cssText = `
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80vw;
      height: 80vh;
      background: #1a1a1a;
      border: 2px solid #d4a017;
      border-radius: 8px;
      z-index: 1000;
      flex-direction: column;
      font-family: 'IBM Plex Mono', monospace;
      color: #c8b06b;
      box-shadow: 0 0 40px rgba(212, 160, 23, 0.3);
    `;

    // Header bar
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #3a3a2a;
      flex-shrink: 0;
    `;

    // Title
    this.titleEl = document.createElement("h2");
    this.titleEl.style.cssText = "margin: 0; font-size: 16px; color: #d4a017;";
    this.titleEl.textContent = "Building";

    // Status
    this.statusEl = document.createElement("span");
    this.statusEl.style.cssText = "font-size: 12px; padding: 2px 8px; border-radius: 4px;";

    // Toggle button
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.style.cssText = `
      background: #2a2a1a;
      border: 1px solid #d4a017;
      color: #d4a017;
      padding: 6px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
    `;
    this.toggleBtn.textContent = "Start Server";
    this.toggleBtn.addEventListener("click", () => this.handleToggle());

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = `
      background: none;
      border: 1px solid #5a3a3a;
      color: #8b4444;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-family: 'IBM Plex Mono', monospace;
      font-size: 12px;
    `;
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => this.close());

    const controls = document.createElement("div");
    controls.style.cssText = "display: flex; gap: 8px; align-items: center;";
    controls.appendChild(this.statusEl);
    controls.appendChild(this.toggleBtn);
    controls.appendChild(closeBtn);

    header.appendChild(this.titleEl);
    header.appendChild(controls);

    // Description
    this.descEl = document.createElement("p");
    this.descEl.style.cssText = `
      margin: 0;
      padding: 8px 16px;
      font-size: 11px;
      color: #7a7a5a;
      border-bottom: 1px solid #3a3a2a;
      flex-shrink: 0;
    `;

    // Iframe
    this.iframe = document.createElement("iframe");
    this.iframe.style.cssText = `
      flex: 1;
      border: none;
      background: #000;
      border-radius: 0 0 6px 6px;
    `;
    this.iframe.src = "about:blank";

    this.container.appendChild(header);
    this.container.appendChild(this.descEl);
    this.container.appendChild(this.iframe);

    document.body.appendChild(this.container);
  }

  /** Open the panel for a specific building */
  open(buildingId: string, name: string, description: string, status: ProjectStatus) {
    this.currentBuildingId = buildingId;
    this.titleEl.textContent = name;
    this.descEl.textContent = description;
    this.updateStatus(status);

    this.container.style.display = "flex";
    this.visible = true;
  }

  /** Close the panel */
  close() {
    this.container.style.display = "none";
    this.visible = false;
    this.currentBuildingId = null;
    this.currentPort = null;
    this.iframe.src = "about:blank";
    this.callbacks.onClose();
  }

  /** Update the displayed project status */
  updateStatus(status: ProjectStatus) {
    if (status === "NotInitialized") {
      this.statusEl.textContent = "Not Initialized";
      this.statusEl.style.background = "#3a3a3a";
      this.statusEl.style.color = "#888";
      this.toggleBtn.textContent = "Start Server";
      this.toggleBtn.disabled = true;
      this.currentPort = null;
      this.iframe.src = "about:blank";
    } else if (typeof status === "object" && "Ready" in status) {
      this.statusEl.textContent = "Ready";
      this.statusEl.style.background = "#2a3a2a";
      this.statusEl.style.color = "#6b8b6b";
      this.toggleBtn.textContent = "Start Server";
      this.toggleBtn.disabled = false;
      this.currentPort = null;
      this.iframe.src = "about:blank";
    } else if (typeof status === "object" && "Running" in status) {
      const port = status.Running;
      this.statusEl.textContent = `Running :${port}`;
      this.statusEl.style.background = "#2a3a1a";
      this.statusEl.style.color = "#8bbb44";
      this.toggleBtn.textContent = "Stop Server";
      this.toggleBtn.disabled = false;
      this.currentPort = port;
      this.iframe.src = `http://localhost:${port}`;
    } else if (typeof status === "object" && "Error" in status) {
      this.statusEl.textContent = "Error";
      this.statusEl.style.background = "#3a2a2a";
      this.statusEl.style.color = "#bb4444";
      this.toggleBtn.textContent = "Start Server";
      this.toggleBtn.disabled = false;
      this.currentPort = null;
      this.iframe.src = "about:blank";
    }
  }

  private handleToggle() {
    if (!this.currentBuildingId) return;

    if (this.currentPort !== null) {
      // Stop server
      this.callbacks.onAction({
        StopDevServer: { building_id: this.currentBuildingId },
      });
    } else {
      // Start server
      this.callbacks.onAction({
        StartDevServer: { building_id: this.currentBuildingId },
      });
    }
  }

  /** Handle keyboard input */
  handleKey(key: string): boolean {
    if (!this.visible) return false;
    if (key === "Escape") {
      this.close();
      return true;
    }
    return false;
  }

  destroy() {
    this.container.remove();
  }
}
```

**Step 2: Integrate BuildingPanel in main.tsx**

In main.tsx, after UI creation:

```typescript
import { BuildingPanel } from "./ui/building-panel";

const buildingPanel = new BuildingPanel({
  onAction: (action) => {
    connection.sendInput({
      tick: clientTick,
      movement: { x: 0, y: 0 },
      action,
      target: null,
    });
  },
  onClose: () => {
    // Resume game input
  },
});
```

Add to the keyboard handler (Escape handling section), add `buildingPanel.visible` to the menu-blocking check, and add an interaction handler — when the player presses `E` or clicks on a completed building, open the panel with its data.

In the state update processing section, update the panel's status if it's open and the building's status changed:

```typescript
if (buildingPanel.visible && latestState.project_manager) {
  // Update status from project_manager state
}
```

**Step 3: Commit**

```bash
git add client/src/ui/building-panel.ts client/src/main.tsx
git commit -m "feat: add building project overlay panel with iframe"
```

---

### Task 8: Client — Build Menu Blueprint Locks

**Files:**
- Modify: `client/src/ui/build-menu.ts` — show locked buildings greyed out

**Step 1: Read build-menu.ts**

Read the file for exact structure.

**Step 2: Add unlocked state tracking**

Add to the `BuildMenu` class:

```typescript
private unlockedBuildings: Set<string> = new Set();

/** Update which buildings are unlocked */
setUnlockedBuildings(ids: string[]) {
  this.unlockedBuildings = new Set(ids);
  this.rebuildRows();
}
```

**Step 3: Modify row rendering to show lock state**

In `rebuildRows()`, when rendering each building entry, check if it's in the unlocked set. If locked:
- Render name text in dark grey (#555) instead of amber
- Append " [LOCKED]" to name text
- Skip the row when confirming selection (don't allow placing locked buildings)

In `confirmSelection()`, add a guard:

```typescript
const building = this.buildings[this.selectedIndex];
const buildingId = /* convert building.type to snake_case id */;
if (!this.unlockedBuildings.has(buildingId)) {
  return; // Can't place locked buildings
}
```

**Step 4: Feed unlock data from game state**

In main.tsx, in the state update processing, when `project_manager` data arrives:

```typescript
if (latestState.project_manager) {
  buildMenu.setUnlockedBuildings(latestState.project_manager.unlocked_buildings);
}
```

**Step 5: Commit**

```bash
git add client/src/ui/build-menu.ts client/src/main.tsx
git commit -m "feat: show locked buildings in build menu with blueprint requirement"
```

---

### Task 9: Client — Debug Panel Extensions

**Files:**
- Modify: `client/src/ui/debug-panel.ts` — add unlock all/lock all buttons

**Step 1: Read debug-panel.ts**

Read the file for the current structure and pattern.

**Step 2: Add unlock/lock building debug actions**

Following the existing debug action pattern, add two new buttons:
- "Unlock All Buildings" — sends `DebugUnlockAllBuildings` action
- "Lock All Buildings" — sends `DebugLockAllBuildings` action

These should be added to the debug panel's button list using the same pattern as existing debug buttons (like "Toggle Spawning", "Clear Rogues", etc.).

**Step 3: Commit**

```bash
git add client/src/ui/debug-panel.ts
git commit -m "feat: add building unlock/lock debug controls"
```

---

### Task 10: Integration — Building Interaction Flow

**Files:**
- Modify: `client/src/main.tsx` — add building click/interact handler to open panel

**Step 1: Read main.tsx entity click handling**

Understand how entities are currently clicked or interacted with.

**Step 2: Add building interaction handler**

When the player presses `E` (interact key) or clicks on a building entity:
1. Check if the clicked entity is a completed building (construction_pct >= 1.0)
2. Look up the building's type and convert to manifest ID
3. Look up project status from `latestState.project_manager.building_statuses`
4. Open the BuildingPanel with that data

Add to the keyboard handler, when `E` is pressed:

```typescript
// Find nearest building entity within interaction range
const nearbyBuilding = findNearestBuilding(playerPos, entities, 48); // 48px range
if (nearbyBuilding) {
  const buildingId = buildingTypeToId(nearbyBuilding.data.building_type);
  const manifest = findManifestEntry(buildingId); // from buildings_manifest or hardcoded
  const status = latestState?.project_manager?.building_statuses?.[buildingId] ?? "NotInitialized";
  buildingPanel.open(buildingId, manifest.name, manifest.description, status);
}
```

Helper function to find nearest building:

```typescript
function findNearestBuilding(
  playerPos: Vec2,
  entities: Map<number, EntityDelta>,
  range: number
): EntityDelta | null {
  let nearest: EntityDelta | null = null;
  let nearestDist = range;
  for (const entity of entities.values()) {
    if (entity.kind !== "Building") continue;
    const data = entity.data?.Building;
    if (!data || data.construction_pct < 1.0) continue;
    const dx = entity.position.x - playerPos.x;
    const dy = entity.position.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = entity;
    }
  }
  return nearest;
}
```

**Step 3: Add building type to ID conversion on client**

```typescript
function buildingTypeToId(type: string): string {
  return type.replace(/([A-Z])/g, (match, p1, offset) =>
    offset > 0 ? "_" + p1.toLowerCase() : p1.toLowerCase()
  ).replace(/^_/, "");
}
```

**Step 4: Add buildingPanel.visible to menu-blocking check**

In the game loop, add `buildingPanel.visible` to the condition that blocks game input.

**Step 5: Verify full flow manually**

1. Start server: `cd server && cargo run`
2. Start client: `cd client && npm run dev`
3. Open game, set project directory in settings
4. Place a building, wait for construction
5. Walk to building, press E
6. Panel should open showing project status
7. Click Start Server — dev server should start
8. Iframe should load the Vite app
9. Click Stop Server — server stops
10. Press Escape — panel closes

**Step 6: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: wire building interaction to open project panel with iframe"
```

---

### Task 11: Unify Protocol ProjectStatus Types

**Files:**
- Modify: `server/src/project/mod.rs` — use the protocol ProjectStatus type instead of duplicating

**Step 1: Remove the duplicate ProjectStatus from project/mod.rs**

Replace the local `ProjectStatus` enum with an import from protocol:

```rust
use crate::protocol::ProjectStatus;
```

Remove the local `ProjectStatus` enum definition from `project/mod.rs`.

**Step 2: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles

**Step 3: Commit**

```bash
git add server/src/project/mod.rs
git commit -m "refactor: unify ProjectStatus type between project module and protocol"
```

---

### Task 12: Final Integration Test

**Step 1: Full build verification**

Run server build:
```bash
cd server && cargo build
```
Expected: Builds successfully

Run client build:
```bash
cd client && npm run build
```
Expected: Builds successfully

**Step 2: Manual end-to-end test**

1. Start server: `cd server && cargo run`
2. Start client: `cd client && npm run dev`
3. Open browser to client URL
4. Open settings modal, enter a project directory path
5. Click "Initialize Projects" — should scaffold 30 Vite projects
6. Click Play to enter game
7. Open build menu (B), verify Tier 1 buildings are available, Tier 2+ show "[LOCKED]"
8. Open debug panel (backtick), click "Unlock All Buildings"
9. Verify all buildings now available in build menu
10. Place a building, wait for construction
11. Walk to building, press E — panel opens
12. Click Start Server — iframe shows Vite default page
13. Click Stop Server — iframe clears
14. Press Escape — panel closes
15. Open settings, click "Reset All Projects" — dirs wiped and re-scaffolded

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete building architecture — projects, dev servers, iframe overlay, blueprints"
```
