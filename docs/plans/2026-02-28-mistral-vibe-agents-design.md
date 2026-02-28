# Mistral Vibe Agent Sessions Design

## Problem
When agents are assigned to buildings, they immediately enter Building state and start hitting context errors (simulated). There's no actual AI coding happening — the Mistral model mappings per agent tier are cosmetic.

## Solution
Make agents pathfind to buildings, then spawn real Mistral Vibe CLI sessions in PTY processes. Stream terminal output to the client via xterm.js. Players type prompts directly into the terminal overlay to instruct agents.

## Agent State Machine

```
Idle → Walking → Building (Vibe Session Active)
                    ↓ (error/unassign)
                   Idle
```

- **Walking**: New state. Agent walks straight line toward building at `BASE_WANDER_SPEED * agent.speed`. Transitions to Building when within ~16px.
- **Building**: Agent is at building. Server spawns Vibe PTY session. Existing error mechanics (turns_used, error_chance, token_burn) still apply.
- On error or unassign: PTY process killed, agent returns to Idle.

## Vibe Session Management (Server)

New module: `server/src/vibe/`

### VibeSession
- Wraps a PTY child process (via `portable-pty` crate)
- Tracks state: Starting, Running, Errored, Completed
- Buffers output for streaming to client
- Handles stdin from player input

### VibeManager
- `HashMap<agent_id, VibeSession>` of active sessions
- Spawns sessions when agents arrive at buildings
- Kills sessions on unassign/error/building destruction

### Spawn Configuration
```
Command: vibe --max-turns {agent.vibe_config.max_turns}
Working dir: {project_base}/{building.directory_name}/
Env: MISTRAL_API_KEY={player_provided_key}
Model: Set via config based on agent tier
  - Apprentice: ministral-3b-2025-01
  - Journeyman: ministral-8b-2025-01
  - Artisan: codestral-2025-05
  - Architect: devstral-2-2025-07
```

## Network Protocol

### New WebSocket Message Types

**Client → Server (PlayerAction):**
- `VibeInput { agent_id: u64, data: String }` — keyboard input for vibe session
- `SetMistralApiKey { key: String }` — player provides API key

**Server → Client (separate from GameStateUpdate):**
- `VibeOutput { agent_id: u64, data: Vec<u8> }` — raw PTY bytes (real-time)
- `VibeSessionStarted { agent_id: u64 }`
- `VibeSessionEnded { agent_id: u64, reason: String }`

Terminal output sent immediately as PTY produces it, not batched with 20Hz game ticks.

## Terminal Overlay (Client)

### Technology
- xterm.js (`@xterm/xterm` + `@xterm/addon-fit`)
- One Terminal instance per active vibe session

### UX
- **Hover to peek**: Small preview (~300x200px) near agent/building, read-only, shows recent output
- **Click to pin**: Larger (~600x400px), interactive, player can type. Stays open.
- **Close**: X button or click elsewhere to unpin. Session continues in background.
- **Positioning**: Floats near the agent/building in world space, moves with camera

### Styling
- Dark terminal theme (black bg, white/green text)
- Semi-transparent in peek mode, opaque when pinned
- Title bar: agent name + building name + status indicator

## API Key in Settings
- New field in existing SettingsModal
- Player enters Mistral API key
- Stored in server memory (not persisted to disk)
- Passed as env var to all vibe processes

## Agent Stats Integration
- **Tier → Model**: Already mapped in AgentVibeConfig
- **max_turns → --max-turns**: CLI flag (5/15/30/50 by tier)
- **Error mechanics**: agent_tick_system kills PTY on error trigger
- **Token burn**: Continues during active session at vibe.token_burn_rate
- **Speed**: Affects walk speed to building only
- **Reliability**: Affects error_chance (high reliability = longer sessions)
