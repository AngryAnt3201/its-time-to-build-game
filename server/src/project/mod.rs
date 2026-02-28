pub mod manifest;
pub mod process;
pub mod scaffold;

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tracing::{info, warn};

use manifest::BuildingsManifest;
use process::DevServerProcess;

// ── Project Status ──────────────────────────────────────────────────────

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub enum ProjectStatus {
    NotInitialized,
    Ready,
    Running(u16), // port number
    Error(String),
}

// ── Project Manager ─────────────────────────────────────────────────────

pub struct ProjectManager {
    /// User-selected base directory for all building projects.
    pub base_dir: Option<PathBuf>,
    /// Parsed buildings manifest.
    pub manifest: BuildingsManifest,
    /// Currently running dev server processes, keyed by building id.
    running_processes: HashMap<String, DevServerProcess>,
    /// Set of building ids that have been unlocked (available for construction).
    unlocked_buildings: HashSet<String>,
    /// Whether initial project scaffolding has been run.
    pub initialized: bool,
    /// Per-building project status.
    pub statuses: HashMap<String, ProjectStatus>,
    /// Mapping from building id to a list of assigned agent entity ids.
    pub agent_assignments: HashMap<String, Vec<u64>>,
}

impl ProjectManager {
    // ── Constructor ──────────────────────────────────────────────────

    /// Create a new ProjectManager.
    ///
    /// Loads the buildings manifest from `manifest_path`.  Buildings that
    /// have `unlocked_by_default == true` are pre-populated into the
    /// unlocked set.  Falls back gracefully if the manifest file is
    /// missing or malformed.
    pub fn new(manifest_path: &std::path::Path) -> Self {
        let manifest = BuildingsManifest::load_from_file(manifest_path);

        let mut unlocked_buildings = HashSet::new();
        let mut statuses = HashMap::new();

        for building in &manifest.buildings {
            if building.unlocked_by_default {
                unlocked_buildings.insert(building.id.clone());
            }
            statuses.insert(building.id.clone(), ProjectStatus::NotInitialized);
        }

        info!(
            "ProjectManager created: {} buildings loaded, {} unlocked by default",
            manifest.buildings.len(),
            unlocked_buildings.len(),
        );

        Self {
            base_dir: None,
            manifest,
            running_processes: HashMap::new(),
            unlocked_buildings,
            initialized: false,
            statuses,
            agent_assignments: HashMap::new(),
        }
    }

    // ── Base directory ───────────────────────────────────────────────

    /// Set the base directory for all building project directories.
    /// Validates that the path exists and is a directory.
    pub fn set_base_dir(&mut self, path: String) -> Result<(), String> {
        let p = PathBuf::from(&path);
        if !p.exists() {
            return Err(format!("Path does not exist: {}", path));
        }
        if !p.is_dir() {
            return Err(format!("Path is not a directory: {}", path));
        }
        info!("Base directory set to {}", p.display());
        self.base_dir = Some(p);
        Ok(())
    }

    // ── Scaffolding ─────────────────────────────────────────────────

    /// Scaffold all building project directories under `base_dir`.
    /// Returns a list of status messages (one per building).
    pub async fn initialize_projects(&mut self) -> Result<Vec<String>, String> {
        let base = self
            .base_dir
            .as_ref()
            .ok_or_else(|| "Base directory not set".to_string())?
            .clone();

        let mut results = Vec::new();

        for building in &self.manifest.buildings {
            let dir = base.join(&building.directory_name);
            match scaffold::scaffold_project(&dir, &building.name, &building.description, building.tier, building.port).await {
                Ok(msg) => {
                    self.statuses
                        .insert(building.id.clone(), ProjectStatus::Ready);
                    results.push(msg);
                }
                Err(e) => {
                    self.statuses
                        .insert(building.id.clone(), ProjectStatus::Error(e.clone()));
                    results.push(format!("{}: ERROR - {}", building.name, e));
                }
            }
        }

        self.initialized = true;
        info!("Project initialization complete");
        Ok(results)
    }

    /// Stop all running servers, delete all project directories, and
    /// re-scaffold from scratch.
    pub async fn reset_projects(&mut self) -> Result<Vec<String>, String> {
        let base = self
            .base_dir
            .as_ref()
            .ok_or_else(|| "Base directory not set".to_string())?
            .clone();

        // Stop everything first
        self.stop_all_servers().await;

        // Remove each building directory
        for building in &self.manifest.buildings {
            let dir = base.join(&building.directory_name);
            if dir.exists() {
                if let Err(e) = tokio::fs::remove_dir_all(&dir).await {
                    warn!(
                        "Failed to remove directory {}: {}",
                        dir.display(),
                        e
                    );
                }
            }
            self.statuses
                .insert(building.id.clone(), ProjectStatus::NotInitialized);
        }

        self.initialized = false;

        // Re-scaffold
        self.initialize_projects().await
    }

    // ── Dev servers ─────────────────────────────────────────────────

    /// Start a dev server for the given building id.
    /// Returns the port number on success.
    pub async fn start_dev_server(&mut self, building_id: &str) -> Result<u16, String> {
        let base = self
            .base_dir
            .as_ref()
            .ok_or_else(|| "Base directory not set".to_string())?
            .clone();

        let building = self
            .manifest
            .get_building(building_id)
            .ok_or_else(|| format!("Unknown building id: {}", building_id))?
            .clone();

        if self.running_processes.contains_key(building_id) {
            return Err(format!(
                "Dev server for {} is already running",
                building_id
            ));
        }

        let dir = base.join(&building.directory_name);
        if !dir.join("package.json").exists() {
            return Err(format!(
                "Project {} has not been scaffolded yet",
                building_id
            ));
        }

        let proc = process::start_dev_server(&dir, building.port).await?;
        let port = proc.port;

        self.running_processes
            .insert(building_id.to_string(), proc);
        self.statuses
            .insert(building_id.to_string(), ProjectStatus::Running(port));

        info!("Dev server started for {} on port {}", building_id, port);
        Ok(port)
    }

    /// Stop the dev server for the given building id.
    pub async fn stop_dev_server(&mut self, building_id: &str) -> Result<(), String> {
        if let Some(mut proc) = self.running_processes.remove(building_id) {
            proc.kill().await;
            self.statuses
                .insert(building_id.to_string(), ProjectStatus::Ready);
            info!("Dev server stopped for {}", building_id);
            Ok(())
        } else {
            Err(format!(
                "No running dev server for {}",
                building_id
            ))
        }
    }

    /// Stop all running dev server processes.
    pub async fn stop_all_servers(&mut self) {
        let ids: Vec<String> = self.running_processes.keys().cloned().collect();
        for id in ids {
            if let Some(mut proc) = self.running_processes.remove(&id) {
                proc.kill().await;
                self.statuses.insert(id.clone(), ProjectStatus::Ready);
            }
        }
        info!("All dev servers stopped");
    }

    // ── Status queries ──────────────────────────────────────────────

    /// Get the current status for a building project.
    pub fn get_status(&self, building_id: &str) -> ProjectStatus {
        self.statuses
            .get(building_id)
            .cloned()
            .unwrap_or(ProjectStatus::NotInitialized)
    }

    // ── Unlock management ───────────────────────────────────────────

    /// Unlock a building blueprint so it can be constructed.
    pub fn unlock_building(&mut self, building_id: &str) {
        self.unlocked_buildings.insert(building_id.to_string());
        info!("Building unlocked: {}", building_id);
    }

    /// Check whether a building is unlocked.
    pub fn is_unlocked(&self, building_id: &str) -> bool {
        self.unlocked_buildings.contains(building_id)
    }

    /// Return a sorted list of all unlocked building ids.
    pub fn get_unlocked_buildings(&self) -> Vec<String> {
        let mut v: Vec<String> = self.unlocked_buildings.iter().cloned().collect();
        v.sort();
        v
    }

    /// Debug helper: unlock every building in the manifest.
    pub fn unlock_all(&mut self) {
        for building in &self.manifest.buildings {
            self.unlocked_buildings.insert(building.id.clone());
        }
        info!("All buildings unlocked (debug)");
    }

    /// Debug helper: lock all buildings except those that are unlocked by default.
    pub fn lock_all_non_default(&mut self) {
        self.unlocked_buildings.clear();
        for building in &self.manifest.buildings {
            if building.unlocked_by_default {
                self.unlocked_buildings.insert(building.id.clone());
            }
        }
        info!("Non-default buildings locked (debug)");
    }

    // ── Agent assignment stubs ──────────────────────────────────────

    /// Assign an agent (by entity id) to a building project.
    /// Returns false if the building already has 3 agents or agent is already assigned.
    pub fn assign_agent(&mut self, building_id: &str, agent_id: u64) -> bool {
        let agents = self.agent_assignments
            .entry(building_id.to_string())
            .or_default();
        if agents.len() >= 3 {
            warn!("Building {} already has 3 agents assigned", building_id);
            return false;
        }
        if agents.contains(&agent_id) {
            warn!("Agent {} already assigned to {}", agent_id, building_id);
            return false;
        }
        agents.push(agent_id);
        info!("Agent {} assigned to {}", agent_id, building_id);
        true
    }

    /// Remove an agent assignment from a building project.
    pub fn unassign_agent(&mut self, building_id: &str, agent_id: u64) {
        if let Some(agents) = self.agent_assignments.get_mut(building_id) {
            agents.retain(|&id| id != agent_id);
            info!("Agent {} unassigned from {}", agent_id, building_id);
        }
    }

    /// Get the list of agent entity ids assigned to a building.
    pub fn get_assigned_agents(&self, building_id: &str) -> Vec<u64> {
        self.agent_assignments
            .get(building_id)
            .cloned()
            .unwrap_or_default()
    }

    // ── Utility ─────────────────────────────────────────────────────

    /// Convert a PascalCase building type name (e.g. "TodoApp") to its
    /// snake_case id (e.g. "todo_app").
    ///
    /// This is useful for mapping from the ECS `BuildingKind` type names
    /// back to manifest building ids.
    pub fn building_type_to_id(building_type: &str) -> Option<String> {
        if building_type.is_empty() {
            return None;
        }

        let mut result = String::new();
        for (i, ch) in building_type.chars().enumerate() {
            if ch.is_uppercase() {
                if i > 0 {
                    result.push('_');
                }
                result.push(ch.to_lowercase().next().unwrap());
            } else {
                result.push(ch);
            }
        }

        Some(result)
    }
}
