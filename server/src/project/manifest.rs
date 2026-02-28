use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

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
    /// Load the manifest from a JSON file on disk.
    /// Falls back to an empty manifest if the file is missing or malformed.
    pub fn load_from_file(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(contents) => match serde_json::from_str::<BuildingsManifest>(&contents) {
                Ok(manifest) => {
                    info!(
                        "Loaded buildings manifest with {} buildings",
                        manifest.buildings.len()
                    );
                    manifest
                }
                Err(e) => {
                    warn!(
                        "Failed to parse buildings manifest at {}: {}. Using empty manifest.",
                        path.display(),
                        e
                    );
                    BuildingsManifest::default()
                }
            },
            Err(e) => {
                warn!(
                    "Failed to read buildings manifest at {}: {}. Using empty manifest.",
                    path.display(),
                    e
                );
                BuildingsManifest::default()
            }
        }
    }

    /// Look up a building definition by its id.
    pub fn get_building(&self, id: &str) -> Option<&BuildingDefinition> {
        self.buildings.iter().find(|b| b.id == id)
    }
}
