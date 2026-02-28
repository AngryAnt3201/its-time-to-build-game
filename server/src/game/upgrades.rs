use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::ecs::components::TokenEconomy;

// ── Upgrade identifiers ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum UpgradeId {
    // Tier 1 -- Foundations
    ExpandedContextWindow,
    VerboseLogging,
    TokenCompression,
    // Tier 2 -- Tooling
    GitAccess,
    WebSearch,
    FileSystemAccess,
    CrankAssignment,
    // Tier 3 -- Infrastructure
    MultiAgentCoordination,
    PersistentMemory,
    AutonomousScouting,
    // Tier 4 -- Late Game
    AgentSpawning,
    DistributedCompute,
    AlignmentProtocols,
}

// ── Upgrade definition ──────────────────────────────────────────────

pub struct UpgradeDef {
    pub id: UpgradeId,
    pub name: &'static str,
    pub tier: u8,
    pub cost: i64,
    pub description: &'static str,
    pub prerequisite: Option<UpgradeId>,
}

/// Returns the full catalogue of upgrades.
pub fn all_upgrades() -> &'static [UpgradeDef] {
    use UpgradeId::*;

    static UPGRADES: &[UpgradeDef] = &[
        // ── Tier 1 -- Foundations ────────────────────────────────────
        UpgradeDef {
            id: ExpandedContextWindow,
            name: "Expanded Context Window",
            tier: 1,
            cost: 100,
            description: "Agents handle larger blueprints",
            prerequisite: None,
        },
        UpgradeDef {
            id: VerboseLogging,
            name: "Verbose Logging",
            tier: 1,
            cost: 75,
            description: "Agent states visible further",
            prerequisite: None,
        },
        UpgradeDef {
            id: TokenCompression,
            name: "Token Compression",
            tier: 1,
            cost: 120,
            description: "Reduced upkeep",
            prerequisite: None,
        },
        // ── Tier 2 -- Tooling ───────────────────────────────────────
        UpgradeDef {
            id: GitAccess,
            name: "Git Access",
            tier: 2,
            cost: 200,
            description: "Extended recovery window",
            prerequisite: Some(ExpandedContextWindow),
        },
        UpgradeDef {
            id: WebSearch,
            name: "Web Search",
            tier: 2,
            cost: 180,
            description: "Agents explore better",
            prerequisite: Some(VerboseLogging),
        },
        UpgradeDef {
            id: FileSystemAccess,
            name: "File System Access",
            tier: 2,
            cost: 250,
            description: "Faster builds",
            prerequisite: Some(TokenCompression),
        },
        UpgradeDef {
            id: CrankAssignment,
            name: "Crank Assignment",
            tier: 2,
            cost: 150,
            description: "Assign agent to crank",
            prerequisite: Some(TokenCompression),
        },
        // ── Tier 3 -- Infrastructure ────────────────────────────────
        UpgradeDef {
            id: MultiAgentCoordination,
            name: "Multi-Agent Coordination",
            tier: 3,
            cost: 400,
            description: "Agents collaborate",
            prerequisite: Some(GitAccess),
        },
        UpgradeDef {
            id: PersistentMemory,
            name: "Persistent Memory",
            tier: 3,
            cost: 350,
            description: "Better XP retention",
            prerequisite: Some(WebSearch),
        },
        UpgradeDef {
            id: AutonomousScouting,
            name: "Autonomous Scouting",
            tier: 3,
            cost: 300,
            description: "Self-assign exploration",
            prerequisite: Some(FileSystemAccess),
        },
        // ── Tier 4 -- Late Game ─────────────────────────────────────
        UpgradeDef {
            id: AgentSpawning,
            name: "Agent Spawning",
            tier: 4,
            cost: 600,
            description: "Agents recruit agents",
            prerequisite: Some(MultiAgentCoordination),
        },
        UpgradeDef {
            id: DistributedCompute,
            name: "Distributed Compute",
            tier: 4,
            cost: 500,
            description: "Token gen scales with agents",
            prerequisite: Some(PersistentMemory),
        },
        UpgradeDef {
            id: AlignmentProtocols,
            name: "Alignment Protocols",
            tier: 4,
            cost: 800,
            description: "Reduced rogue spawns",
            prerequisite: Some(AutonomousScouting),
        },
    ];

    UPGRADES
}

/// Looks up a single upgrade definition by id.
pub fn get_upgrade(id: UpgradeId) -> &'static UpgradeDef {
    all_upgrades()
        .iter()
        .find(|u| u.id == id)
        .expect("unknown upgrade id")
}

// ── Player upgrade state ────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct UpgradeState {
    pub purchased: HashSet<UpgradeId>,
}

impl UpgradeState {
    pub fn new() -> Self {
        Self {
            purchased: HashSet::new(),
        }
    }

    /// Returns `true` if the player can afford the upgrade and its
    /// prerequisite (if any) has already been purchased.
    pub fn can_purchase(&self, id: UpgradeId, balance: i64) -> bool {
        if self.purchased.contains(&id) {
            return false;
        }
        let def = get_upgrade(id);
        if balance < def.cost {
            return false;
        }
        if let Some(prereq) = def.prerequisite {
            if !self.purchased.contains(&prereq) {
                return false;
            }
        }
        true
    }

    /// Attempts to purchase the given upgrade, deducting its cost from
    /// `economy.balance`.  Returns `Err` with a human-readable reason on
    /// failure.
    pub fn purchase(
        &mut self,
        id: UpgradeId,
        economy: &mut TokenEconomy,
    ) -> Result<(), String> {
        if self.purchased.contains(&id) {
            return Err("already purchased".to_string());
        }
        let def = get_upgrade(id);
        if economy.balance < def.cost {
            return Err(format!(
                "not enough tokens (need {}, have {})",
                def.cost, economy.balance
            ));
        }
        if let Some(prereq) = def.prerequisite {
            if !self.purchased.contains(&prereq) {
                let prereq_def = get_upgrade(prereq);
                return Err(format!(
                    "prerequisite not met: {}",
                    prereq_def.name
                ));
            }
        }
        economy.balance -= def.cost;
        self.purchased.insert(id);
        Ok(())
    }

    /// Returns `true` if the upgrade has been purchased.
    pub fn has(&self, id: UpgradeId) -> bool {
        self.purchased.contains(&id)
    }
}
