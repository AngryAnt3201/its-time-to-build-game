use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

/// Agent profile definitions: (file_stem, display_name, model_alias)
const GAME_AGENTS: &[(&str, &str, &str)] = &[
    ("game-apprentice", "Game Apprentice", "devstral-small"),
    ("game-journeyman", "Game Journeyman", "devstral-small"),
    ("game-artisan", "Game Artisan", "devstral-2"),
    ("game-architect", "Game Architect", "devstral-2"),
];

fn vibe_agents_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".vibe").join("agents"))
}

/// Generate the TOML content for a game agent profile.
fn agent_toml(display_name: &str, model_alias: &str) -> String {
    format!(
        r#"display_name = "{display_name}"
description = "Auto-generated agent for the build game"
safety = "yolo"
active_model = "{model_alias}"
auto_approve = true
"#,
    )
}

/// Ensure custom vibe agent TOML files exist in ~/.vibe/agents/.
/// Creates them if missing; updates them if the model alias has changed.
pub fn ensure_vibe_agent_profiles() {
    let agents_dir = match vibe_agents_dir() {
        Some(d) => d,
        None => {
            warn!("Could not determine home directory; skipping vibe agent setup");
            return;
        }
    };

    if let Err(e) = fs::create_dir_all(&agents_dir) {
        warn!("Failed to create ~/.vibe/agents/: {}", e);
        return;
    }

    for (stem, display_name, model_alias) in GAME_AGENTS {
        let path = agents_dir.join(format!("{}.toml", stem));
        let expected = agent_toml(display_name, model_alias);

        let needs_write = if path.exists() {
            match fs::read_to_string(&path) {
                Ok(existing) => existing != expected,
                Err(_) => true,
            }
        } else {
            true
        };

        if needs_write {
            match fs::write(&path, &expected) {
                Ok(()) => info!("Wrote vibe agent profile: {}", path.display()),
                Err(e) => warn!("Failed to write {}: {}", path.display(), e),
            }
        }
    }
}
