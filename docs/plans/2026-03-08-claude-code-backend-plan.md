# Claude Code AI Backend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Claude Code as a second AI backend alongside Mistral Vibe, selectable via prominent cards on the title screen.

**Architecture:** Add an `AiBackend` enum (`MistralVibe | ClaudeCode`) that flows from client selection through to session spawning. The session layer abstracts over both CLIs (same PTY architecture). The title screen gets two prominent selection cards before the project directory setup.

**Tech Stack:** Rust (server), React/TypeScript (client), PTY (portable-pty), xterm.js

---

### Task 1: Add AiBackend enum to server protocol

**Files:**
- Modify: `server/src/protocol.rs:362-368`

**Step 1: Add the AiBackend enum and SetAiBackend action**

Add after the existing enums (around line 340, before `PlayerAction`):

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AiBackend {
    MistralVibe,
    ClaudeCode,
}
```

Add a new variant to `PlayerAction` (after `SetMistralApiKey`):

```rust
    SetAiBackend { backend: AiBackend },
```

**Step 2: Add AiBackend to client protocol.ts**

In `client/src/network/protocol.ts`, add the type and action:

```typescript
export type AiBackend = "MistralVibe" | "ClaudeCode";
```

Add to `PlayerAction` union (after `SetMistralApiKey`):

```typescript
  | { SetAiBackend: { backend: AiBackend } }
```

**Step 3: Commit**

```bash
git add server/src/protocol.rs client/src/network/protocol.ts
git commit -m "feat: add AiBackend enum and SetAiBackend protocol action"
```

---

### Task 2: Update VibeManager to support both backends

**Files:**
- Modify: `server/src/vibe/manager.rs`

**Step 1: Add backend field to VibeManager**

Add import at top:

```rust
use crate::protocol::AiBackend;
```

Add field to `VibeManager` struct:

```rust
pub struct VibeManager {
    sessions: HashMap<u64, VibeSession>,
    api_key: Option<String>,
    output_receivers: HashMap<u64, mpsc::UnboundedReceiver<Vec<u8>>>,
    failed_spawns: std::collections::HashSet<u64>,
    backend: AiBackend,
}
```

**Step 2: Update constructor and add set_backend method**

Update `new()` to default to `MistralVibe`:

```rust
    pub fn new() -> Self {
        let api_key = std::env::var("MISTRAL_API_KEY").ok().filter(|k| !k.is_empty());
        if api_key.is_some() {
            info!("Using MISTRAL_API_KEY from environment");
        }
        Self {
            sessions: HashMap::new(),
            api_key,
            output_receivers: HashMap::new(),
            failed_spawns: std::collections::HashSet::new(),
            backend: AiBackend::MistralVibe,
        }
    }

    pub fn set_backend(&mut self, backend: AiBackend) {
        info!("AI backend set to {:?}", backend);
        self.backend = backend;
    }

    pub fn backend(&self) -> AiBackend {
        self.backend
    }
```

**Step 3: Update start_session to accept backend parameter**

Modify `start_session` to pass the backend through:

```rust
    pub fn start_session(
        &mut self,
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        vibe_agent_name: String,
        max_turns: u32,
        enabled_tools: Vec<String>,
    ) -> Result<(), String> {
        // For Claude Code, no API key needed
        let api_key = match self.backend {
            AiBackend::MistralVibe => {
                self.api_key
                    .as_ref()
                    .ok_or_else(|| "No Mistral API key set".to_string())?
                    .clone()
            }
            AiBackend::ClaudeCode => String::new(), // Uses machine auth
        };

        if self.sessions.contains_key(&agent_id) {
            return Err(format!("Session already exists for agent {}", agent_id));
        }

        let (output_tx, output_rx) = mpsc::unbounded_channel();

        let session = VibeSession::spawn(
            agent_id,
            building_id,
            working_dir,
            vibe_agent_name,
            max_turns,
            api_key,
            enabled_tools,
            output_tx,
            self.backend,
        )?;

        self.sessions.insert(agent_id, session);
        self.output_receivers.insert(agent_id, output_rx);

        Ok(())
    }
```

**Step 4: Update has_api_key to account for Claude Code**

```rust
    pub fn has_api_key(&self) -> bool {
        match self.backend {
            AiBackend::ClaudeCode => true, // No key needed
            AiBackend::MistralVibe => self.api_key.as_ref().map_or(false, |k| !k.is_empty()),
        }
    }
```

**Step 5: Commit**

```bash
git add server/src/vibe/manager.rs
git commit -m "feat: add backend awareness to VibeManager"
```

---

### Task 3: Update VibeSession to spawn either CLI

**Files:**
- Modify: `server/src/vibe/session.rs`

**Step 1: Update spawn() to accept backend and build correct command**

Add import:

```rust
use crate::protocol::AiBackend;
```

Update the `spawn` function signature to add `backend: AiBackend` parameter, and replace the command-building section (lines 47-57):

```rust
    pub fn spawn(
        agent_id: u64,
        building_id: String,
        working_dir: PathBuf,
        vibe_agent_name: String,
        max_turns: u32,
        api_key: String,
        enabled_tools: Vec<String>,
        output_tx: mpsc::UnboundedSender<Vec<u8>>,
        backend: AiBackend,
    ) -> Result<Self, String> {
```

Replace the command building block:

```rust
        let mut cmd = match backend {
            AiBackend::MistralVibe => {
                let mut c = CommandBuilder::new("vibe");
                c.arg("--agent");
                c.arg(&vibe_agent_name);
                c.arg("--max-turns");
                c.arg(max_turns.to_string());
                for tool in &enabled_tools {
                    c.arg("--enabled-tools");
                    c.arg(tool);
                }
                c.env("MISTRAL_API_KEY", &api_key);
                c
            }
            AiBackend::ClaudeCode => {
                let mut c = CommandBuilder::new("claude");
                c.arg("--model");
                c.arg(&vibe_agent_name); // vibe_agent_name holds the model ID for Claude
                c.arg("--max-turns");
                c.arg(max_turns.to_string());
                for tool in &enabled_tools {
                    c.arg("--allowedTools");
                    c.arg(tool);
                }
                c
            }
        };
        cmd.cwd(&working_dir);
```

Update the log message to show which backend:

```rust
        let backend_name = match backend {
            AiBackend::MistralVibe => "Mistral Vibe",
            AiBackend::ClaudeCode => "Claude Code",
        };
        info!(
            "{} session spawned for agent {} on building {} (agent: {}, max_turns: {}, tools: {:?})",
            backend_name, agent_id, building_id, vibe_agent_name, max_turns, enabled_tools
        );
```

**Step 2: Commit**

```bash
git add server/src/vibe/session.rs
git commit -m "feat: support spawning Claude Code CLI in VibeSession"
```

---

### Task 4: Add Claude model mapping to agent config

**Files:**
- Modify: `server/src/game/agents.rs:114-162`

**Step 1: Add generate_claude_config function**

Add after the existing `generate_vibe_config` function:

```rust
/// Generate the Claude Code configuration for a given agent tier.
pub fn generate_claude_config(tier: AgentTierKind) -> AgentVibeConfig {
    match tier {
        AgentTierKind::Apprentice => AgentVibeConfig {
            model_id: "claude-haiku-4-5-20251001".to_string(),
            model_lore_name: "Flickering Candle".to_string(),
            vibe_agent_name: "claude-haiku-4-5-20251001".to_string(),
            max_turns: 5,
            turns_used: 0,
            context_window: 200_000,
            token_burn_rate: 3,
            error_chance_base: 0.15,
            stars: 1,
        },
        AgentTierKind::Journeyman => AgentVibeConfig {
            model_id: "claude-sonnet-4-6".to_string(),
            model_lore_name: "Steady Flame".to_string(),
            vibe_agent_name: "claude-sonnet-4-6".to_string(),
            max_turns: 15,
            turns_used: 0,
            context_window: 200_000,
            token_burn_rate: 2,
            error_chance_base: 0.08,
            stars: 2,
        },
        AgentTierKind::Artisan => AgentVibeConfig {
            model_id: "claude-sonnet-4-6".to_string(),
            model_lore_name: "Codestral Engine".to_string(),
            vibe_agent_name: "claude-sonnet-4-6".to_string(),
            max_turns: 30,
            turns_used: 0,
            context_window: 200_000,
            token_burn_rate: 1,
            error_chance_base: 0.04,
            stars: 3,
        },
        AgentTierKind::Architect => AgentVibeConfig {
            model_id: "claude-opus-4-6".to_string(),
            model_lore_name: "Abyssal Architect".to_string(),
            vibe_agent_name: "claude-opus-4-6".to_string(),
            max_turns: 50,
            turns_used: 0,
            context_window: 200_000,
            token_burn_rate: 1,
            error_chance_base: 0.02,
            stars: 3,
        },
    }
}
```

**Step 2: Commit**

```bash
git add server/src/game/agents.rs
git commit -m "feat: add Claude Code model mapping per agent tier"
```

---

### Task 5: Wire SetAiBackend action in server main loop

**Files:**
- Modify: `server/src/main.rs`

**Step 1: Handle SetAiBackend action**

Find the `SetMistralApiKey` handler (around line 541) and add the new handler after it:

```rust
                    PlayerAction::SetAiBackend { backend } => {
                        vibe_manager.set_backend(*backend);
                        // Re-generate vibe configs for all agents based on new backend
                        use crate::game::agents::{generate_vibe_config, generate_claude_config};
                        use crate::protocol::AiBackend;
                        let config_fn = match backend {
                            AiBackend::MistralVibe => generate_vibe_config,
                            AiBackend::ClaudeCode => generate_claude_config,
                        };
                        for (_id, mut vibe_config, tier) in world.query_mut::<(&mut AgentVibeConfig, &AgentTier)>() {
                            let new_config = config_fn(tier.tier);
                            vibe_config.model_id = new_config.model_id;
                            vibe_config.model_lore_name = new_config.model_lore_name;
                            vibe_config.vibe_agent_name = new_config.vibe_agent_name;
                            vibe_config.context_window = new_config.context_window;
                            // Preserve turns_used, max_turns, etc.
                        }
                        debug_log_entries.push(format!("[vibe] AI backend set to {:?}", backend));
                    }
```

**Step 2: Skip vibe agent profile creation when using Claude Code**

In the initialization section (around line 89-90), make `ensure_vibe_agent_profiles()` conditional:

The current code:
```rust
    let mut vibe_manager = VibeManager::new();
    ensure_vibe_agent_profiles();
```

Keep as-is — profiles are only used by Mistral and are harmless if present.

**Step 3: Commit**

```bash
git add server/src/main.rs
git commit -m "feat: handle SetAiBackend action and re-generate agent configs"
```

---

### Task 6: Add backend selection to client localStorage utils

**Files:**
- Create: `client/src/utils/ai-backend.ts`

**Step 1: Create the utility file**

```typescript
export type AiBackend = 'MistralVibe' | 'ClaudeCode';

const STORAGE_KEY = 'ai_backend';

export function getAiBackend(): AiBackend | null {
  return localStorage.getItem(STORAGE_KEY) as AiBackend | null;
}

export function setAiBackend(backend: AiBackend): void {
  localStorage.setItem(STORAGE_KEY, backend);
}
```

**Step 2: Commit**

```bash
git add client/src/utils/ai-backend.ts
git commit -m "feat: add AI backend localStorage utility"
```

---

### Task 7: Add backend selection cards to TitleScreen

**Files:**
- Modify: `client/src/ui/title-screen/TitleScreen.tsx`
- Modify: `client/src/ui/title-screen/TitleScreen.css`

**Step 1: Update TitleScreen component**

Add import at top:

```typescript
import { getAiBackend, setAiBackend, type AiBackend } from '../../utils/ai-backend';
```

Add state for backend selection:

```typescript
const [backend, setBackendState] = useState<AiBackend | null>(getAiBackend());
```

Add handler:

```typescript
  function handleSelectBackend(b: AiBackend) {
    playClick();
    setAiBackend(b);
    setBackendState(b);
  }
```

Update `isReady` to require backend selection:

```typescript
const isReady = !!projectDir && projectDir.length > 0 && !!backend;
```

Add backend selection cards between the title group and project setup section (after line 106, before the project-setup div):

```tsx
        {/* ── AI Backend selection ────────────────────────── */}
        <div className="backend-selection">
          <p className="backend-prompt">CHOOSE YOUR AI ENGINE</p>
          <div className="backend-cards">
            <button
              className={`backend-card ${backend === 'ClaudeCode' ? 'backend-card--selected' : ''}`}
              onClick={() => handleSelectBackend('ClaudeCode')}
            >
              <span className="backend-card-name">CLAUDE CODE</span>
              <span className="backend-card-desc">Anthropic</span>
            </button>
            <button
              className={`backend-card ${backend === 'MistralVibe' ? 'backend-card--selected' : ''}`}
              onClick={() => handleSelectBackend('MistralVibe')}
            >
              <span className="backend-card-name">MISTRAL VIBE</span>
              <span className="backend-card-desc">Mistral AI</span>
            </button>
          </div>
        </div>
```

**Step 2: Add CSS for backend selection cards**

Add to `TitleScreen.css`:

```css
/* ── Backend selection ─────────────────────────────────────── */

.backend-selection {
  margin: 1.2rem 0 0.6rem;
  text-align: center;
}

.backend-prompt {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  color: var(--clr-gold);
  opacity: 0.7;
  margin-bottom: 0.8rem;
  text-transform: uppercase;
}

.backend-cards {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.backend-card {
  background: rgba(10, 10, 10, 0.85);
  border: 1px solid rgba(200, 180, 100, 0.25);
  padding: 1rem 1.8rem;
  cursor: pointer;
  text-align: center;
  transition: all 0.2s ease;
  min-width: 160px;
  position: relative;
  font-family: var(--font-mono);
}

.backend-card:hover {
  border-color: var(--clr-gold);
  background: rgba(20, 18, 10, 0.9);
  box-shadow: 0 0 20px rgba(200, 180, 100, 0.15);
}

.backend-card--selected {
  border-color: var(--clr-green);
  background: rgba(10, 25, 10, 0.9);
  box-shadow: 0 0 25px rgba(80, 200, 80, 0.2), inset 0 0 30px rgba(80, 200, 80, 0.05);
}

.backend-card--selected:hover {
  border-color: var(--clr-green);
}

.backend-card-name {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--clr-text);
  margin-bottom: 0.3rem;
}

.backend-card--selected .backend-card-name {
  color: var(--clr-green);
}

.backend-card-desc {
  display: block;
  font-size: 0.6rem;
  letter-spacing: 0.12em;
  color: var(--clr-gold);
  opacity: 0.6;
}
```

**Step 3: Commit**

```bash
git add client/src/ui/title-screen/TitleScreen.tsx client/src/ui/title-screen/TitleScreen.css client/src/utils/ai-backend.ts
git commit -m "feat: add prominent AI backend selection cards to title screen"
```

---

### Task 8: Send backend selection to server on game start

**Files:**
- Modify: `client/src/main.tsx`

**Step 1: Send SetAiBackend action after connection**

Find where `SetMistralApiKey` is sent (around line 519-526) and add the backend action before it:

```typescript
import { getAiBackend } from './utils/ai-backend';
```

Then after connection setup, before the Mistral key send:

```typescript
  // Send AI backend selection to server
  const selectedBackend = getAiBackend();
  if (selectedBackend) {
    connection.sendInput({
      tick: 0,
      movement: { x: 0, y: 0 },
      action: { SetAiBackend: { backend: selectedBackend } },
      target: null,
    });
  }

  // Send Mistral API key to server for vibe sessions (only if using Mistral)
  if (selectedBackend === 'MistralVibe' || !selectedBackend) {
    const mistralKey = getApiKey('mistral');
    if (mistralKey) {
      connection.sendInput({
        tick: 0,
        movement: { x: 0, y: 0 },
        action: { SetMistralApiKey: { key: mistralKey } },
        target: null,
      });
    }
  }
```

**Step 2: Commit**

```bash
git add client/src/main.tsx
git commit -m "feat: send AI backend selection to server on game start"
```

---

### Task 9: Conditionally show Mistral API key in settings

**Files:**
- Modify: `client/src/ui/title-screen/SettingsModal.tsx`

**Step 1: Import backend utility and conditionally render Mistral key field**

Add import:

```typescript
import { getAiBackend } from '../../utils/ai-backend';
```

Wrap the Mistral API Key input group (lines 91-110) with a conditional:

```tsx
        {getAiBackend() !== 'ClaudeCode' && (
          <div className="input-group">
            <label>Mistral API Key</label>
            {/* ... existing Mistral key input ... */}
          </div>
        )}
```

**Step 2: Commit**

```bash
git add client/src/ui/title-screen/SettingsModal.tsx
git commit -m "feat: hide Mistral API key in settings when using Claude Code"
```

---

### Task 10: Verify build and test

**Step 1: Build the server**

Run: `cd server && cargo build 2>&1`
Expected: Successful compilation

**Step 2: Build the client**

Run: `cd client && npm run build 2>&1`
Expected: Successful compilation

**Step 3: Run existing tests**

Run: `cd server && cargo test 2>&1`
Expected: All existing tests pass

**Step 4: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: resolve build issues from Claude Code backend integration"
```
