# Bound Agent Camps Design

## Overview

Bound agents are discoverable NPCs scattered across the map that the player can recruit by spending tokens. Each bound agent is guarded by a group of enemies that patrol the area. The player must fight through the guards to reach and recruit the agent, who then pathfinds back to the player's home base.

## Spawning

- Uses the existing discovery scatter system (`exploration.rs`)
- New `DiscoveryKind::BoundAgent { tier }` variant
- ~6% chance per non-origin chunk
- Tier distribution: 50% Apprentice, 25% Journeyman, 15% Artisan, 10% Architect
- Higher-tier agents have more and stronger guardians

## Guardian Enemies

- Spawn in a ring 30-60 units around the bound agent
- Count by tier: Apprentice=2, Journeyman=3, Artisan=4, Architect=5
- Guardian types by tier:
  - Apprentice: all Swarm
  - Journeyman: Swarm + Corruptor mix
  - Artisan: Swarm + Corruptor + Looper
  - Architect: Swarm + Corruptor + Looper + Assassin

### Guardian AI (leashed patrol)

- **Patrolling**: wander 40-unit radius around home position
- **Chasing**: if player within 100 units, pursue them
- **Returning**: if >200 units from home, disengage and walk back
- Guardians do NOT chase globally like normal rogues
- When bound agent is recruited: guardians lose leash, become normal rogues

## New ECS Components

- `BoundAgent` - marker on agent entities that are bound (not yet recruited)
- `GuardianRogue { home_x, home_y, leash_radius, bound_agent_entity }` - on guardian rogue entities

## Recruitment Flow

1. Player clicks bound agent within 32 units
2. Server validates token balance (same cost as normal recruitment by tier)
3. Deducts tokens, removes `BoundAgent` marker
4. Sets agent state to `Walking` with `walk_target` = home base (0,0)
5. Remaining guardians lose `GuardianRogue` component, become normal aggressive rogues

## Protocol

- `EntityDelta` gets `bound_agent: Option<bool>` field
- `EntityDelta` gets `guardian_home: Option<(f32, f32)>` for guardian patrol center

## Client Rendering

- Bound agents render as dormant agents with a pulsing glow/distinct color
- Click to recruit (same as dormant agent interaction but with bound-agent-specific messaging)
- Guardian rogues render as normal rogues
- On recruitment: agent starts walking toward base

## No Pathfinding

The existing agent walk system moves directly toward `walk_target`. Since the map is open with no impassable terrain blocking direct paths (agents walk over everything), direct movement to base is sufficient.
