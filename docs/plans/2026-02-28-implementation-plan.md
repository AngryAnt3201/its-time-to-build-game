# "It's Time to Build" Game — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time strategy / base builder / survival horror game with a Rust ECS game server and TypeScript/PixiJS thin web client, connected over WebSocket with binary msgpack state sync.

**Architecture:** Rust server runs the full game simulation using `hecs` ECS. TypeScript client is a thin renderer that receives state deltas at 20 ticks/sec over WebSocket and renders via PixiJS. Mistral Vibe powers agent AI behavior. ElevenLabs voice system is pluggable with placeholder audio first.

**Tech Stack:** Rust (hecs, tokio, tokio-tungstenite, rmp-serde, noise, serde), TypeScript (pixi.js, msgpack-lite, vite)

**Design Doc:** `docs/plans/2026-02-28-architecture-design.md`

---

## Phase 1: Project Scaffolding & Connectivity

The foundation. Get both projects building, talking to each other over WebSocket, and rendering a dot on screen that moves when you press keys.

---

### Task 1: Initialize Rust Server Project

**Files:**
- Create: `server/Cargo.toml`
- Create: `server/src/main.rs`
- Create: `server/src/lib.rs`

**Step 1: Create the Rust project**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
cargo init server
```

**Step 2: Add dependencies to Cargo.toml**

Replace `server/Cargo.toml` with:

```toml
[package]
name = "its-time-to-build-server"
version = "0.1.0"
edition = "2021"

[dependencies]
hecs = "0.10"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.24"
futures-util = "0.3"
rmp-serde = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
noise = "0.9"
rand = "0.8"
tracing = "0.1"
tracing-subscriber = "0.3"
```

**Step 3: Write minimal main.rs that starts a WebSocket server**

```rust
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use tracing::{info, error};

#[tokio::main]
async fn main() {
    tracing_subscriber::init();

    let listener = TcpListener::bind("127.0.0.1:9001").await.expect("Failed to bind");
    info!("Game server listening on ws://127.0.0.1:9001");

    while let Ok((stream, addr)) = listener.accept().await {
        info!("New connection from: {}", addr);
        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    error!("WebSocket handshake failed: {}", e);
                    return;
                }
            };
            let (mut write, mut read) = ws_stream.split();
            while let Some(Ok(msg)) = read.next().await {
                if msg.is_text() || msg.is_binary() {
                    let _ = write.send(msg).await;
                }
            }
        });
    }
}
```

**Step 4: Verify it compiles**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`
Expected: Compiles successfully

**Step 5: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/
git commit -m "feat: initialize Rust game server with WebSocket echo"
```

---

### Task 2: Initialize TypeScript Client Project

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.ts`

**Step 1: Initialize the client project**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
mkdir -p client/src
```

**Step 2: Create package.json**

Create `client/package.json`:

```json
{
  "name": "its-time-to-build-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pixi.js": "^8.0.0",
    "@msgpack/msgpack": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^6.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

Create `client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

**Step 4: Create vite.config.ts**

Create `client/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:9001',
        ws: true,
      },
    },
  },
});
```

**Step 5: Create index.html**

Create `client/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>It's Time to Build</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0a; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

**Step 6: Create minimal main.ts with PixiJS canvas**

Create `client/src/main.ts`:

```typescript
import { Application, Graphics } from 'pixi.js';

async function init() {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  // Placeholder player — blue circle
  const player = new Graphics();
  player.circle(0, 0, 8);
  player.fill(0x6688cc);
  player.x = app.screen.width / 2;
  player.y = app.screen.height / 2;
  app.stage.addChild(player);

  console.log('[client] PixiJS initialized');
}

init();
```

**Step 7: Install dependencies and verify**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npm install`
Expected: Dependencies install successfully

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No type errors

**Step 8: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
echo "node_modules/" >> .gitignore
echo "dist/" >> .gitignore
echo "target/" >> .gitignore
git add client/ .gitignore
git commit -m "feat: initialize TypeScript/PixiJS client with Vite"
```

---

### Task 3: Define Shared Protocol Types

**Files:**
- Create: `server/src/protocol.rs`
- Modify: `server/src/lib.rs`
- Create: `client/src/network/protocol.ts`

**Step 1: Define Rust protocol types**

Create `server/src/protocol.rs`:

```rust
use serde::{Deserialize, Serialize};

// === Shared IDs ===

pub type EntityId = u64;
pub type Tick = u64;

// === Server → Client Messages ===

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlayerSnapshot {
    pub position: Vec2,
    pub health: i32,
    pub max_health: i32,
    pub tokens: i64,
    pub torch_range: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum EntityKind {
    Agent,
    Building,
    Rogue,
    Item,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EntityDelta {
    pub id: EntityId,
    pub kind: EntityKind,
    pub position: Vec2,
    pub data: EntityData,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum EntityData {
    Agent {
        name: String,
        state: AgentStateKind,
        tier: AgentTierKind,
        health_pct: f32,
        morale_pct: f32,
    },
    Building {
        building_type: BuildingTypeKind,
        construction_pct: f32,
        health_pct: f32,
    },
    Rogue {
        rogue_type: RogueTypeKind,
        health_pct: f32,
    },
    Item {
        item_type: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum AgentStateKind {
    Idle,
    Building,
    Erroring,
    Exploring,
    Defending,
    Critical,
    Unresponsive,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum AgentTierKind {
    Apprentice,
    Journeyman,
    Artisan,
    Architect,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum BuildingTypeKind {
    Pylon,
    ComputeFarm,
    Barracks,
    ResearchLab,
    Armory,
    TodoApp,
    Calculator,
    LandingPage,
    PortfolioSite,
    PomodoroTimer,
    WeatherApp,
    ColourPickerTool,
    RestApi,
    AuthenticationSystem,
    Database,
    AdminDashboard,
    SearchBar,
    FormWithValidation,
    MarkdownEditor,
    BudgetTracker,
    CiCdPipeline,
    UnitTestSuite,
    CliTool,
    BrowserExtension,
    RecommendationEngine,
    NotificationSystem,
    RateLimiter,
    OauthIntegration,
    WebsocketServer,
    MachineLearningModel,
    VectorDatabase,
    GraphqlApi,
    TransformerModel,
    RagPipeline,
    AutonomousAgentFramework,
    WordleClone,
    NftMarketplace,
    Blockchain,
    AnotherTodoApp,
    HackerNewsClone,
    MyFirstPortfolio,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum RogueTypeKind {
    Corruptor,
    Looper,
    TokenDrain,
    Assassin,
    Swarm,
    Mimic,
    Architect,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChunkPos {
    pub x: i32,
    pub y: i32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FogTile {
    pub light_level: f32, // 0.0 = pitch black, 1.0 = fully lit
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LogEntry {
    pub tick: Tick,
    pub text: String,
    pub category: LogCategory,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum LogCategory {
    System,
    Agent,
    Combat,
    Economy,
    Exploration,
    Building,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum AudioEvent {
    AgentSpeak { agent_id: EntityId, category: String },
    CombatHit { position: Vec2 },
    BuildComplete { building_type: BuildingTypeKind },
    RogueSpawn { rogue_type: RogueTypeKind, position: Vec2 },
    CrankTurn,
    AgentDeath { agent_id: EntityId },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameStateUpdate {
    pub tick: Tick,
    pub player: PlayerSnapshot,
    pub entities_changed: Vec<EntityDelta>,
    pub entities_removed: Vec<EntityId>,
    pub fog_updates: Vec<(ChunkPos, Vec<Vec<FogTile>>)>,
    pub economy: EconomySnapshot,
    pub log_entries: Vec<LogEntry>,
    pub audio_triggers: Vec<AudioEvent>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EconomySnapshot {
    pub balance: i64,
    pub income_per_sec: f64,
    pub expenditure_per_sec: f64,
}

// === Client → Server Messages ===

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum PlayerAction {
    Attack,
    Interact,
    AssignTask { agent_id: EntityId, task: TaskAssignment },
    OpenBuildMenu,
    PlaceBuilding { building_type: BuildingTypeKind, position: Vec2 },
    CrankStart,
    CrankStop,
    RollbackAgent { agent_id: EntityId },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum TaskAssignment {
    Build { building_id: EntityId },
    Explore,
    Guard,
    Crank,
    Idle,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PlayerInput {
    pub tick: Tick,
    pub movement: Vec2,
    pub action: Option<PlayerAction>,
    pub target: Option<EntityId>,
}
```

**Step 2: Export from lib.rs**

Replace `server/src/lib.rs`:

```rust
pub mod protocol;
```

**Step 3: Create TypeScript protocol types**

Create directory: `mkdir -p client/src/network`

Create `client/src/network/protocol.ts`:

```typescript
// === Shared IDs ===
export type EntityId = number;
export type Tick = number;

// === Server → Client ===

export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerSnapshot {
  position: Vec2;
  health: number;
  max_health: number;
  tokens: number;
  torch_range: number;
}

export type EntityKind = 'Agent' | 'Building' | 'Rogue' | 'Item';

export interface EntityDelta {
  id: EntityId;
  kind: EntityKind;
  position: Vec2;
  data: EntityData;
}

export type EntityData =
  | { Agent: { name: string; state: AgentStateKind; tier: AgentTierKind; health_pct: number; morale_pct: number } }
  | { Building: { building_type: BuildingTypeKind; construction_pct: number; health_pct: number } }
  | { Rogue: { rogue_type: RogueTypeKind; health_pct: number } }
  | { Item: { item_type: string } };

export type AgentStateKind = 'Idle' | 'Building' | 'Erroring' | 'Exploring' | 'Defending' | 'Critical' | 'Unresponsive';

export type AgentTierKind = 'Apprentice' | 'Journeyman' | 'Artisan' | 'Architect';

export type BuildingTypeKind =
  | 'Pylon' | 'ComputeFarm' | 'Barracks' | 'ResearchLab' | 'Armory'
  | 'TodoApp' | 'Calculator' | 'LandingPage' | 'PortfolioSite'
  | 'PomodoroTimer' | 'WeatherApp' | 'ColourPickerTool'
  | 'RestApi' | 'AuthenticationSystem' | 'Database' | 'AdminDashboard'
  | 'SearchBar' | 'FormWithValidation' | 'MarkdownEditor' | 'BudgetTracker'
  | 'CiCdPipeline' | 'UnitTestSuite' | 'CliTool' | 'BrowserExtension'
  | 'RecommendationEngine' | 'NotificationSystem' | 'RateLimiter'
  | 'OauthIntegration' | 'WebsocketServer'
  | 'MachineLearningModel' | 'VectorDatabase' | 'GraphqlApi'
  | 'TransformerModel' | 'RagPipeline' | 'AutonomousAgentFramework'
  | 'WordleClone' | 'NftMarketplace' | 'Blockchain'
  | 'AnotherTodoApp' | 'HackerNewsClone' | 'MyFirstPortfolio';

export type RogueTypeKind = 'Corruptor' | 'Looper' | 'TokenDrain' | 'Assassin' | 'Swarm' | 'Mimic' | 'Architect';

export interface ChunkPos {
  x: number;
  y: number;
}

export interface FogTile {
  light_level: number;
}

export interface LogEntry {
  tick: Tick;
  text: string;
  category: LogCategory;
}

export type LogCategory = 'System' | 'Agent' | 'Combat' | 'Economy' | 'Exploration' | 'Building';

export type AudioEvent =
  | { AgentSpeak: { agent_id: EntityId; category: string } }
  | { CombatHit: { position: Vec2 } }
  | { BuildComplete: { building_type: BuildingTypeKind } }
  | { RogueSpawn: { rogue_type: RogueTypeKind; position: Vec2 } }
  | 'CrankTurn'
  | { AgentDeath: { agent_id: EntityId } };

export interface EconomySnapshot {
  balance: number;
  income_per_sec: number;
  expenditure_per_sec: number;
}

export interface GameStateUpdate {
  tick: Tick;
  player: PlayerSnapshot;
  entities_changed: EntityDelta[];
  entities_removed: EntityId[];
  fog_updates: [ChunkPos, FogTile[][]][];
  economy: EconomySnapshot;
  log_entries: LogEntry[];
  audio_triggers: AudioEvent[];
}

// === Client → Server ===

export type PlayerAction =
  | 'Attack'
  | 'Interact'
  | { AssignTask: { agent_id: EntityId; task: TaskAssignment } }
  | 'OpenBuildMenu'
  | { PlaceBuilding: { building_type: BuildingTypeKind; position: Vec2 } }
  | 'CrankStart'
  | 'CrankStop'
  | { RollbackAgent: { agent_id: EntityId } };

export type TaskAssignment =
  | { Build: { building_id: EntityId } }
  | 'Explore'
  | 'Guard'
  | 'Crank'
  | 'Idle';

export interface PlayerInput {
  tick: Tick;
  movement: Vec2;
  action?: PlayerAction;
  target?: EntityId;
}
```

**Step 4: Verify both compile**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`
Expected: Compiles

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/protocol.rs server/src/lib.rs client/src/network/
git commit -m "feat: define shared protocol types for server-client communication"
```

---

### Task 4: WebSocket Connection — Server Sends State, Client Receives

**Files:**
- Create: `server/src/network/mod.rs`
- Create: `server/src/network/server.rs`
- Modify: `server/src/main.rs`
- Modify: `server/src/lib.rs`
- Create: `client/src/network/connection.ts`
- Modify: `client/src/main.ts`

**Step 1: Create server network module**

Create directory: `mkdir -p server/src/network`

Create `server/src/network/mod.rs`:

```rust
pub mod server;
```

Create `server/src/network/server.rs`:

```rust
use crate::protocol::*;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::mpsc;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{info, error, warn};

pub type ClientSender = mpsc::UnboundedSender<Vec<u8>>;
pub type InputReceiver = mpsc::UnboundedReceiver<PlayerInput>;

pub struct GameServer {
    pub client_tx: Option<ClientSender>,
    pub input_rx: Option<InputReceiver>,
}

impl GameServer {
    pub fn new() -> Self {
        Self {
            client_tx: None,
            input_rx: None,
        }
    }

    pub async fn start(&mut self, addr: &str) -> Result<(), Box<dyn std::error::Error>> {
        let listener = TcpListener::bind(addr).await?;
        info!("Game server listening on ws://{}", addr);

        let (client_tx, mut client_rx) = mpsc::unbounded_channel::<Vec<u8>>();
        let (input_tx, input_rx) = mpsc::unbounded_channel::<PlayerInput>();

        self.client_tx = Some(client_tx);
        self.input_rx = Some(input_rx);

        // Accept one client connection (single player)
        if let Ok((stream, addr)) = listener.accept().await {
            info!("Player connected from: {}", addr);

            let ws_stream = accept_async(stream).await?;
            let (mut ws_write, mut ws_read) = ws_stream.split();

            // Task: forward server state updates to WebSocket
            tokio::spawn(async move {
                while let Some(data) = client_rx.recv().await {
                    if ws_write.send(Message::Binary(data.into())).await.is_err() {
                        warn!("Failed to send to client");
                        break;
                    }
                }
            });

            // Task: read player input from WebSocket
            tokio::spawn(async move {
                while let Some(Ok(msg)) = ws_read.next().await {
                    if let Message::Binary(data) = msg {
                        match rmp_serde::from_slice::<PlayerInput>(&data) {
                            Ok(input) => {
                                let _ = input_tx.send(input);
                            }
                            Err(e) => {
                                error!("Failed to decode player input: {}", e);
                            }
                        }
                    }
                }
            });
        }

        Ok(())
    }

    pub fn send_state(&self, update: &GameStateUpdate) {
        if let Some(tx) = &self.client_tx {
            match rmp_serde::to_vec(update) {
                Ok(data) => {
                    let _ = tx.send(data);
                }
                Err(e) => {
                    error!("Failed to encode game state: {}", e);
                }
            }
        }
    }
}
```

**Step 2: Update lib.rs**

```rust
pub mod protocol;
pub mod network;
```

**Step 3: Update main.rs to use server and send test updates**

```rust
use its_time_to_build_server::network::server::GameServer;
use its_time_to_build_server::protocol::*;
use std::time::{Duration, Instant};
use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::init();

    let mut server = GameServer::new();
    server.start("127.0.0.1:9001").await.expect("Failed to start server");

    info!("Game loop starting");

    let tick_duration = Duration::from_millis(50); // 20 ticks/sec
    let mut tick: u64 = 0;
    let mut player_x: f32 = 400.0;
    let mut player_y: f32 = 300.0;

    loop {
        let tick_start = Instant::now();

        // Process input
        if let Some(rx) = &mut server.input_rx {
            while let Ok(input) = rx.try_recv() {
                player_x += input.movement.x * 3.0;
                player_y += input.movement.y * 3.0;
            }
        }

        // Send state
        let update = GameStateUpdate {
            tick,
            player: PlayerSnapshot {
                position: Vec2 { x: player_x, y: player_y },
                health: 100,
                max_health: 100,
                tokens: 50,
                torch_range: 120.0,
            },
            entities_changed: vec![],
            entities_removed: vec![],
            fog_updates: vec![],
            economy: EconomySnapshot {
                balance: 50,
                income_per_sec: 0.0,
                expenditure_per_sec: 0.0,
            },
            log_entries: vec![],
            audio_triggers: vec![],
        };

        server.send_state(&update);
        tick += 1;

        let elapsed = tick_start.elapsed();
        if elapsed < tick_duration {
            tokio::time::sleep(tick_duration - elapsed).await;
        }
    }
}
```

**Step 4: Create client connection module**

Create `client/src/network/connection.ts`:

```typescript
import { encode, decode } from '@msgpack/msgpack';
import type { GameStateUpdate, PlayerInput } from './protocol';

export class Connection {
  private ws: WebSocket | null = null;
  private onStateUpdate: ((update: GameStateUpdate) => void) | null = null;

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[net] connected to server');
        resolve();
      };

      this.ws.onerror = (e) => {
        console.error('[net] connection error', e);
        reject(e);
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const update = decode(new Uint8Array(event.data)) as GameStateUpdate;
          this.onStateUpdate?.(update);
        }
      };

      this.ws.onclose = () => {
        console.log('[net] disconnected');
      };
    });
  }

  onState(callback: (update: GameStateUpdate) => void) {
    this.onStateUpdate = callback;
  }

  sendInput(input: PlayerInput) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const data = encode(input);
      this.ws.send(data);
    }
  }
}
```

**Step 5: Update client main.ts to connect and render player from server state**

Replace `client/src/main.ts`:

```typescript
import { Application, Graphics } from 'pixi.js';
import { Connection } from './network/connection';
import type { PlayerInput, GameStateUpdate } from './network/protocol';

async function init() {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a0a,
    resizeTo: window,
  });
  document.body.appendChild(app.canvas);

  // Player placeholder — blue circle
  const player = new Graphics();
  player.circle(0, 0, 8);
  player.fill(0x6688cc);
  app.stage.addChild(player);

  // Torch light placeholder — radial gradient circle
  const torchLight = new Graphics();
  torchLight.circle(0, 0, 120);
  torchLight.fill({ color: 0xffffff, alpha: 0.05 });
  app.stage.addChild(torchLight);

  // Input state
  const keys: Record<string, boolean> = {};
  window.addEventListener('keydown', (e) => { keys[e.key] = true; });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  // Connect to server
  const connection = new Connection();

  let latestState: GameStateUpdate | null = null;
  connection.onState((update) => {
    latestState = update;
  });

  try {
    await connection.connect('ws://127.0.0.1:9001');
  } catch {
    console.error('[client] Failed to connect to server');
    return;
  }

  let clientTick = 0;

  // Game loop
  app.ticker.add(() => {
    // Build input
    let mx = 0, my = 0;
    if (keys['w'] || keys['ArrowUp']) my -= 1;
    if (keys['s'] || keys['ArrowDown']) my += 1;
    if (keys['a'] || keys['ArrowLeft']) mx -= 1;
    if (keys['d'] || keys['ArrowRight']) mx += 1;

    const input: PlayerInput = {
      tick: clientTick++,
      movement: { x: mx, y: my },
    };

    if (mx !== 0 || my !== 0) {
      connection.sendInput(input);
    }

    // Render from server state
    if (latestState) {
      player.x = latestState.player.position.x;
      player.y = latestState.player.position.y;
      torchLight.x = player.x;
      torchLight.y = player.y;
    }
  });

  console.log('[client] game initialized');
}

init();
```

**Step 6: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`
Expected: Compiles

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`
Expected: No errors

**Step 7: Manual integration test**

Run server in one terminal: `cd server && cargo run`
Run client in another: `cd client && npm run dev`
Open browser to http://localhost:3000
Expected: Blue dot on black screen. WASD moves it. Movement is server-authoritative.

**Step 8: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/ client/
git commit -m "feat: WebSocket connectivity — server sends state, client renders and sends input"
```

---

## Phase 2: Core ECS & World Foundation

Build the actual ECS world with components, the tilemap, fog of war, and the crank.

---

### Task 5: ECS Components & World Setup

**Files:**
- Create: `server/src/ecs/mod.rs`
- Create: `server/src/ecs/components.rs`
- Create: `server/src/ecs/world.rs`
- Modify: `server/src/lib.rs`
- Modify: `server/src/main.rs`

**Step 1: Create ECS component definitions**

Create directory: `mkdir -p server/src/ecs`

Create `server/src/ecs/mod.rs`:

```rust
pub mod components;
pub mod world;
```

Create `server/src/ecs/components.rs`:

```rust
use crate::protocol::*;
use serde::{Deserialize, Serialize};

// === Marker Components ===
pub struct Player;
pub struct Agent;
pub struct Building;
pub struct Rogue;
pub struct DroppedItem;

// === Spatial ===
#[derive(Debug, Clone)]
pub struct Position {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone, Default)]
pub struct Velocity {
    pub x: f32,
    pub y: f32,
}

#[derive(Debug, Clone)]
pub struct Collider {
    pub radius: f32,
}

// === Player Components ===
#[derive(Debug, Clone)]
pub struct Health {
    pub current: i32,
    pub max: i32,
}

#[derive(Debug, Clone)]
pub struct TorchRange {
    pub radius: f32,
}

#[derive(Debug, Clone)]
pub struct CarryCapacity {
    pub current: u32,
    pub max: u32,
}

#[derive(Debug, Clone)]
pub struct CombatPower {
    pub base_damage: i32,
    pub attack_speed: f32, // ticks between attacks
    pub weapon: WeaponType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WeaponType {
    ProcessTerminator,  // Shortsword — fast, low damage
    HardReset,          // Greatsword — slow, high damage
    SignalJammer,       // Staff — interrupts Loopers
    NullPointer,        // Crossbow — ranged
    Flare,              // Torch — AOE reveal + damage
}

#[derive(Debug, Clone, PartialEq)]
pub enum ArmorType {
    BasePrompt,         // Cloth
    FewShotPadding,     // Leather
    ChainOfThoughtMail, // Chain
    ConstitutionalPlate,// Plate
}

#[derive(Debug, Clone)]
pub struct Armor {
    pub armor_type: ArmorType,
    pub damage_reduction: f32, // 0.0 to 1.0
    pub speed_penalty: f32,    // multiplier, 1.0 = no penalty
}

// === Agent Components ===
#[derive(Debug, Clone)]
pub struct AgentStats {
    pub reliability: f32,    // 0.0-1.0, chance of completing build without error
    pub speed: f32,          // build time multiplier
    pub awareness: f32,      // detection radius
    pub resilience: f32,     // total HP
}

#[derive(Debug, Clone)]
pub struct AgentState {
    pub state: AgentStateKind,
}

#[derive(Debug, Clone)]
pub struct AgentMorale {
    pub value: f32, // 0.0-1.0
}

#[derive(Debug, Clone)]
pub struct AgentXP {
    pub xp: u64,
    pub level: u32,
}

#[derive(Debug, Clone)]
pub struct AgentTier {
    pub tier: AgentTierKind,
}

#[derive(Debug, Clone)]
pub struct AgentName {
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct AgentPersonality {
    pub traits: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct VoiceProfile {
    pub voice_id: String,
}

#[derive(Debug, Clone)]
pub struct Assignment {
    pub task: TaskAssignment,
}

// === Building Components ===
#[derive(Debug, Clone)]
pub struct BuildingType {
    pub kind: BuildingTypeKind,
}

#[derive(Debug, Clone)]
pub struct ConstructionProgress {
    pub current: f32,
    pub total: f32,
    pub assigned_agents: Vec<hecs::Entity>,
}

#[derive(Debug, Clone)]
pub struct LightSource {
    pub radius: f32,
    pub color: (f32, f32, f32), // RGB 0-1
}

#[derive(Debug, Clone)]
pub struct BuildingEffects {
    pub effects: Vec<BuildingEffect>,
}

#[derive(Debug, Clone)]
pub enum BuildingEffect {
    PassiveIncome(f64),
    AgentMoraleBoost(f32),
    ErrorRateReduction(f32),
    PylonRangeBoost(f32),
    BuildSpeedBoost(f32),
    CrankHeatReduction(f32),
}

// === Rogue Components ===
#[derive(Debug, Clone)]
pub struct RogueType {
    pub kind: RogueTypeKind,
}

#[derive(Debug, Clone)]
pub struct RogueAI {
    pub behavior_state: RogueBehaviorState,
    pub target: Option<hecs::Entity>,
}

#[derive(Debug, Clone)]
pub enum RogueBehaviorState {
    Wandering,
    Approaching,
    Attacking,
    Attached,   // Corruptor on building, Looper on agent
    Fleeing,
}

#[derive(Debug, Clone)]
pub struct RogueVisibility {
    pub visible: bool, // Token Drains can be semi-invisible
}

// === World State (stored as resources, not ECS) ===
#[derive(Debug, Clone)]
pub struct CrankState {
    pub heat: f32,         // 0.0-1.0
    pub max_heat: f32,     // 1.0
    pub heat_rate: f32,    // per tick while cranking
    pub cool_rate: f32,    // per tick while not cranking
    pub tier: CrankTier,
    pub is_cranking: bool,
    pub assigned_agent: Option<hecs::Entity>,
    pub tokens_per_rotation: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CrankTier {
    HandCrank,
    GearAssembly,
    WaterWheel,
    RunicEngine,
}

#[derive(Debug, Clone)]
pub struct TokenEconomy {
    pub balance: i64,
    pub income_per_tick: f64,
    pub expenditure_per_tick: f64,
    pub income_sources: Vec<(String, f64)>,
    pub expenditure_sinks: Vec<(String, f64)>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GamePhase {
    Hut,
    Outpost,
    Village,
    Network,
    City,
}

#[derive(Debug, Clone)]
pub struct GameState {
    pub phase: GamePhase,
    pub tick: u64,
    pub crank: CrankState,
    pub economy: TokenEconomy,
}
```

**Step 2: Create world.rs with initial world setup**

Create `server/src/ecs/world.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::AgentStateKind;

pub fn create_world() -> (World, GameState) {
    let mut world = World::new();

    // Spawn player at center of starting area
    world.spawn((
        Player,
        Position { x: 400.0, y: 300.0 },
        Velocity::default(),
        Collider { radius: 6.0 },
        Health { current: 100, max: 100 },
        TorchRange { radius: 120.0 },
        CarryCapacity { current: 0, max: 5 },
        CombatPower {
            base_damage: 10,
            attack_speed: 10.0,
            weapon: WeaponType::ProcessTerminator,
        },
    ));

    // Spawn starting agent
    world.spawn((
        Agent,
        Position { x: 420.0, y: 320.0 },
        Velocity::default(),
        Collider { radius: 5.0 },
        Health { current: 50, max: 50 },
        AgentStats {
            reliability: 0.6,
            speed: 1.0,
            awareness: 80.0,
            resilience: 50.0,
        },
        AgentState { state: AgentStateKind::Idle },
        AgentMorale { value: 0.7 },
        AgentXP { xp: 0, level: 1 },
        AgentTier { tier: crate::protocol::AgentTierKind::Apprentice },
        AgentName { name: "sol".to_string() },
        VoiceProfile { voice_id: "placeholder".to_string() },
    ));

    let game_state = GameState {
        phase: GamePhase::Hut,
        tick: 0,
        crank: CrankState {
            heat: 0.0,
            max_heat: 1.0,
            heat_rate: 0.02,
            cool_rate: 0.01,
            tier: CrankTier::HandCrank,
            is_cranking: false,
            assigned_agent: None,
            tokens_per_rotation: 1.0,
        },
        economy: TokenEconomy {
            balance: 50,
            income_per_tick: 0.0,
            expenditure_per_tick: 0.0,
            income_sources: vec![],
            expenditure_sinks: vec![],
        },
    };

    (world, game_state)
}
```

**Step 3: Update lib.rs**

```rust
pub mod protocol;
pub mod network;
pub mod ecs;
```

**Step 4: Update main.rs to use ECS world**

```rust
use its_time_to_build_server::ecs::components::*;
use its_time_to_build_server::ecs::world::create_world;
use its_time_to_build_server::network::server::GameServer;
use its_time_to_build_server::protocol::*;
use std::time::{Duration, Instant};
use tracing::info;

#[tokio::main]
async fn main() {
    tracing_subscriber::init();

    let mut server = GameServer::new();
    server.start("127.0.0.1:9001").await.expect("Failed to start server");

    let (mut world, mut game_state) = create_world();

    info!("Game loop starting — Phase: {:?}", game_state.phase);

    let tick_duration = Duration::from_millis(50);

    loop {
        let tick_start = Instant::now();
        game_state.tick += 1;

        // Process input
        if let Some(rx) = &mut server.input_rx {
            while let Ok(input) = rx.try_recv() {
                // Apply movement to player
                for (_id, (_, pos, vel)) in world.query_mut::<(&Player, &mut Position, &mut Velocity)>() {
                    vel.x = input.movement.x * 3.0;
                    vel.y = input.movement.y * 3.0;
                    pos.x += vel.x;
                    pos.y += vel.y;
                }
            }
        }

        // Build state update from ECS
        let mut player_snapshot = PlayerSnapshot {
            position: Vec2 { x: 0.0, y: 0.0 },
            health: 100,
            max_health: 100,
            tokens: game_state.economy.balance,
            torch_range: 120.0,
        };

        for (_id, (_, pos, health, torch)) in world.query_mut::<(&Player, &Position, &Health, &TorchRange)>() {
            player_snapshot.position = Vec2 { x: pos.x, y: pos.y };
            player_snapshot.health = health.current;
            player_snapshot.max_health = health.max;
            player_snapshot.torch_range = torch.radius;
        }

        // Gather agent entities
        let mut entities_changed = Vec::new();
        for (id, (_, pos, name, state, tier, health, morale)) in world.query_mut::<(
            &Agent, &Position, &AgentName, &AgentState, &AgentTier, &Health, &AgentMorale
        )>() {
            entities_changed.push(EntityDelta {
                id: id.to_bits().into(),
                kind: EntityKind::Agent,
                position: Vec2 { x: pos.x, y: pos.y },
                data: EntityData::Agent {
                    name: name.name.clone(),
                    state: state.state.clone(),
                    tier: tier.tier.clone(),
                    health_pct: health.current as f32 / health.max as f32,
                    morale_pct: morale.value,
                },
            });
        }

        let update = GameStateUpdate {
            tick: game_state.tick,
            player: player_snapshot,
            entities_changed,
            entities_removed: vec![],
            fog_updates: vec![],
            economy: EconomySnapshot {
                balance: game_state.economy.balance,
                income_per_sec: game_state.economy.income_per_tick * 20.0,
                expenditure_per_sec: game_state.economy.expenditure_per_tick * 20.0,
            },
            log_entries: vec![],
            audio_triggers: vec![],
        };

        server.send_state(&update);

        let elapsed = tick_start.elapsed();
        if elapsed < tick_duration {
            tokio::time::sleep(tick_duration - elapsed).await;
        }
    }
}
```

**Step 5: Verify**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`
Expected: Compiles

**Step 6: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/ecs/
git commit -m "feat: ECS components, world setup with player and starting agent"
```

---

### Task 6: Tilemap & Fog of War System

**Files:**
- Create: `server/src/game/mod.rs`
- Create: `server/src/game/tilemap.rs`
- Create: `server/src/game/fog.rs`
- Modify: `server/src/lib.rs`
- Create: `client/src/renderer/world.ts`
- Create: `client/src/renderer/lighting.ts`

**Step 1: Create server tilemap**

Create directories: `mkdir -p server/src/game server/src/ecs/systems`

Create `server/src/game/mod.rs`:

```rust
pub mod tilemap;
pub mod fog;
```

Create `server/src/game/tilemap.rs`:

```rust
use noise::{NoiseFn, Simplex};

pub const CHUNK_SIZE: usize = 32;
pub const TILE_SIZE: f32 = 16.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Terrain {
    Grass,
    Stone,
    Water,
    Dirt,
}

#[derive(Debug, Clone)]
pub struct Chunk {
    pub cx: i32,
    pub cy: i32,
    pub tiles: [[Terrain; CHUNK_SIZE]; CHUNK_SIZE],
    pub generated: bool,
}

impl Chunk {
    pub fn generate(cx: i32, cy: i32, seed: u32) -> Self {
        let noise = Simplex::new(seed);
        let mut tiles = [[Terrain::Grass; CHUNK_SIZE]; CHUNK_SIZE];

        for ty in 0..CHUNK_SIZE {
            for tx in 0..CHUNK_SIZE {
                let world_x = (cx * CHUNK_SIZE as i32 + tx as i32) as f64 * 0.05;
                let world_y = (cy * CHUNK_SIZE as i32 + ty as i32) as f64 * 0.05;
                let val = noise.get([world_x, world_y]);

                tiles[ty][tx] = if val < -0.3 {
                    Terrain::Water
                } else if val < 0.0 {
                    Terrain::Dirt
                } else if val > 0.5 {
                    Terrain::Stone
                } else {
                    Terrain::Grass
                };
            }
        }

        Self { cx, cy, tiles, generated: true }
    }
}

pub struct TileMap {
    pub chunks: std::collections::HashMap<(i32, i32), Chunk>,
    pub seed: u32,
}

impl TileMap {
    pub fn new(seed: u32) -> Self {
        Self {
            chunks: std::collections::HashMap::new(),
            seed,
        }
    }

    pub fn get_or_generate(&mut self, cx: i32, cy: i32) -> &Chunk {
        self.chunks.entry((cx, cy)).or_insert_with(|| {
            Chunk::generate(cx, cy, self.seed)
        })
    }

    pub fn world_to_chunk(world_x: f32, world_y: f32) -> (i32, i32) {
        let cx = (world_x / (CHUNK_SIZE as f32 * TILE_SIZE)).floor() as i32;
        let cy = (world_y / (CHUNK_SIZE as f32 * TILE_SIZE)).floor() as i32;
        (cx, cy)
    }
}
```

**Step 2: Create fog of war system**

Create `server/src/game/fog.rs`:

```rust
use std::collections::HashSet;

pub struct FogOfWar {
    pub revealed: HashSet<(i32, i32)>, // chunk coords that have been revealed
    pub lit_tiles: HashSet<(i32, i32, usize, usize)>, // (chunk_x, chunk_y, tile_x, tile_y) currently lit
}

impl FogOfWar {
    pub fn new() -> Self {
        Self {
            revealed: HashSet::new(),
            lit_tiles: HashSet::new(),
        }
    }

    /// Update lit tiles based on light sources (pylons + player torch)
    /// Returns newly revealed chunk positions
    pub fn update_light(
        &mut self,
        light_sources: &[(f32, f32, f32)], // (world_x, world_y, radius)
    ) -> Vec<(i32, i32)> {
        self.lit_tiles.clear();
        let mut newly_revealed = Vec::new();

        for &(lx, ly, radius) in light_sources {
            let tile_radius = (radius / super::tilemap::TILE_SIZE) as i32;
            let center_tx = (lx / super::tilemap::TILE_SIZE) as i32;
            let center_ty = (ly / super::tilemap::TILE_SIZE) as i32;

            for dy in -tile_radius..=tile_radius {
                for dx in -tile_radius..=tile_radius {
                    let dist_sq = (dx * dx + dy * dy) as f32;
                    if dist_sq <= (tile_radius * tile_radius) as f32 {
                        let tx = center_tx + dx;
                        let ty = center_ty + dy;
                        let chunk_size = super::tilemap::CHUNK_SIZE as i32;
                        let cx = tx.div_euclid(chunk_size);
                        let cy = ty.div_euclid(chunk_size);
                        let local_tx = tx.rem_euclid(chunk_size) as usize;
                        let local_ty = ty.rem_euclid(chunk_size) as usize;

                        self.lit_tiles.insert((cx, cy, local_tx, local_ty));

                        if self.revealed.insert((cx, cy)) {
                            newly_revealed.push((cx, cy));
                        }
                    }
                }
            }
        }

        newly_revealed
    }

    pub fn is_lit(&self, cx: i32, cy: i32, tx: usize, ty: usize) -> bool {
        self.lit_tiles.contains(&(cx, cy, tx, ty))
    }
}
```

**Step 3: Update lib.rs**

```rust
pub mod protocol;
pub mod network;
pub mod ecs;
pub mod game;
```

**Step 4: Create client world renderer**

Create directory: `mkdir -p client/src/renderer`

Create `client/src/renderer/world.ts`:

```typescript
import { Container, Graphics } from 'pixi.js';

const TILE_SIZE = 16;
const CHUNK_SIZE = 32;

export class WorldRenderer {
  container: Container;
  private tileGraphics: Map<string, Graphics> = new Map();

  constructor() {
    this.container = new Container();
  }

  renderChunkTerrain(cx: number, cy: number, lightLevels: number[][]) {
    const key = `${cx},${cy}`;
    let graphic = this.tileGraphics.get(key);
    if (!graphic) {
      graphic = new Graphics();
      this.container.addChild(graphic);
      this.tileGraphics.set(key, graphic);
    }

    graphic.clear();
    const baseX = cx * CHUNK_SIZE * TILE_SIZE;
    const baseY = cy * CHUNK_SIZE * TILE_SIZE;

    for (let ty = 0; ty < lightLevels.length; ty++) {
      for (let tx = 0; tx < lightLevels[ty].length; tx++) {
        const light = lightLevels[ty][tx];
        if (light > 0) {
          // Dark ground with slight variation based on position
          const shade = Math.floor(0x1a + light * 0x20);
          const color = (shade << 16) | (shade << 8) | shade;
          graphic.rect(baseX + tx * TILE_SIZE, baseY + ty * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          graphic.fill(color);
        }
      }
    }
  }
}
```

**Step 5: Create client lighting renderer**

Create `client/src/renderer/lighting.ts`:

```typescript
import { Container, Graphics, BlurFilter } from 'pixi.js';

export class LightingRenderer {
  container: Container;
  private darknessOverlay: Graphics;
  private lightMask: Graphics;

  constructor(screenWidth: number, screenHeight: number) {
    this.container = new Container();

    // Full-screen darkness
    this.darknessOverlay = new Graphics();
    this.darknessOverlay.rect(0, 0, screenWidth * 2, screenHeight * 2);
    this.darknessOverlay.fill({ color: 0x000000, alpha: 0.95 });
    this.container.addChild(this.darknessOverlay);

    // Light cutout mask
    this.lightMask = new Graphics();
    this.container.mask = this.lightMask;
  }

  updateLights(lights: Array<{ x: number; y: number; radius: number; color: number }>, cameraX: number, cameraY: number) {
    this.darknessOverlay.x = cameraX - this.darknessOverlay.width / 2;
    this.darknessOverlay.y = cameraY - this.darknessOverlay.height / 2;

    // For the placeholder phase, we invert the approach:
    // Instead of a darkness overlay with light cutouts, we just set alpha on the darkness
    // based on distance from light sources. This is simpler and works well for placeholders.
    // Full shader-based approach comes in art pass.
  }

  updateTorchLight(x: number, y: number, radius: number) {
    this.lightMask.clear();
    this.lightMask.circle(x, y, radius);
    this.lightMask.fill(0xffffff);
  }
}
```

**Step 6: Verify compilation**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit`

**Step 7: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/game/ client/src/renderer/
git commit -m "feat: tilemap generation, fog of war, client world and lighting renderers"
```

---

### Task 7: The Wheel Crank — Core Token Generation

**Files:**
- Create: `server/src/ecs/systems/mod.rs`
- Create: `server/src/ecs/systems/crank.rs`
- Create: `server/src/ecs/systems/economy.rs`
- Modify: `server/src/main.rs` — integrate crank system into game loop

**Step 1: Create systems module**

Create `server/src/ecs/systems/mod.rs`:

```rust
pub mod crank;
pub mod economy;
```

Update `server/src/ecs/mod.rs`:

```rust
pub mod components;
pub mod world;
pub mod systems;
```

**Step 2: Create crank system**

Create `server/src/ecs/systems/crank.rs`:

```rust
use crate::ecs::components::*;

pub struct CrankResult {
    pub tokens_generated: f64,
    pub log_message: Option<String>,
}

pub fn crank_system(game_state: &mut GameState, player_cranking: bool) -> CrankResult {
    let crank = &mut game_state.crank;
    let mut result = CrankResult {
        tokens_generated: 0.0,
        log_message: None,
    };

    if player_cranking && crank.heat < crank.max_heat {
        crank.is_cranking = true;
        crank.heat = (crank.heat + crank.heat_rate).min(crank.max_heat);

        let efficiency = match crank.tier {
            CrankTier::HandCrank => 1.0,
            CrankTier::GearAssembly => 1.5,
            CrankTier::WaterWheel => 2.0,
            CrankTier::RunicEngine => 4.0,
        };

        result.tokens_generated = crank.tokens_per_rotation * efficiency;
        game_state.economy.balance += result.tokens_generated as i64;

        if crank.heat >= crank.max_heat {
            result.log_message = Some("[crank] overheated — cooling required".to_string());
        }
    } else {
        crank.is_cranking = false;
        crank.heat = (crank.heat - crank.cool_rate).max(0.0);
    }

    // Passive generation from Water Wheel / Runic Engine
    let passive = match crank.tier {
        CrankTier::WaterWheel => 0.3,
        CrankTier::RunicEngine => 2.0,
        _ => 0.0,
    };
    if passive > 0.0 {
        result.tokens_generated += passive;
        game_state.economy.balance += passive as i64;
    }

    result
}
```

**Step 3: Create economy system**

Create `server/src/ecs/systems/economy.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::AgentStateKind;

pub fn economy_system(world: &World, game_state: &mut GameState) {
    let mut total_income = 0.0_f64;
    let mut total_expenditure = 0.0_f64;
    let mut income_sources = Vec::new();
    let mut expenditure_sinks = Vec::new();

    // Agent wages — per tick while active
    for (_id, (_, state, tier)) in world.query::<(&Agent, &AgentState, &AgentTier)>().iter() {
        let wage = match tier.tier {
            crate::protocol::AgentTierKind::Apprentice => 0.05,
            crate::protocol::AgentTierKind::Journeyman => 0.1,
            crate::protocol::AgentTierKind::Artisan => 0.2,
            crate::protocol::AgentTierKind::Architect => 0.4,
        };

        let cost = match state.state {
            AgentStateKind::Unresponsive => 0.0, // dead costs nothing
            AgentStateKind::Idle => wage * 0.5,  // idle costs half upkeep
            _ => wage,
        };

        if cost > 0.0 {
            total_expenditure += cost;
            expenditure_sinks.push(("agent_wages".to_string(), cost));
        }
    }

    // Building passive income (Compute Farms, Todo App, etc.)
    for (_id, (_, building, progress)) in world.query::<(&Building, &BuildingType, &ConstructionProgress)>().iter() {
        if progress.current >= progress.total {
            // Building is complete
            if let Some(effects) = get_building_passive_income(&building.kind) {
                total_income += effects;
                income_sources.push((format!("{:?}", building.kind), effects));
            }
        }
    }

    // Apply
    game_state.economy.income_per_tick = total_income;
    game_state.economy.expenditure_per_tick = total_expenditure;
    game_state.economy.income_sources = income_sources;
    game_state.economy.expenditure_sinks = expenditure_sinks;

    let net = total_income - total_expenditure;
    game_state.economy.balance += net as i64;
}

fn get_building_passive_income(kind: &crate::protocol::BuildingTypeKind) -> Option<f64> {
    use crate::protocol::BuildingTypeKind::*;
    match kind {
        TodoApp => Some(0.02),
        PortfolioSite => Some(0.05),
        ComputeFarm => Some(0.5),
        RestApi => Some(0.1),
        MachineLearningModel => Some(1.0),
        TransformerModel => Some(3.0),
        _ => None,
    }
}
```

**Step 4: Integrate into main.rs game loop**

Update the game loop in `server/src/main.rs` to call `crank_system` and `economy_system` each tick. Process `CrankStart`/`CrankStop` player actions from input.

**Step 5: Verify**

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`
Expected: Compiles

**Step 6: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/ecs/systems/
git commit -m "feat: crank token generation and economy systems"
```

---

## Phase 3: Agent System & Building

---

### Task 8: Agent Recruitment & Task Assignment

**Files:**
- Create: `server/src/game/agents.rs`
- Modify: `server/src/game/mod.rs`
- Modify: `server/src/main.rs` — process AssignTask actions

**Step 1: Create agent management module**

Create `server/src/game/agents.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::*;
use rand::Rng;

const FIRST_NAMES: &[&str] = &[
    "sol", "mira", "echo", "nova", "kai", "iris", "ash", "luna",
    "byte", "flux", "pip", "hex", "reed", "sage", "fern", "rune",
    "wren", "arc", "ori", "lux", "coda", "vale", "drift", "ember",
];

pub fn recruit_agent(
    world: &mut World,
    tier: AgentTierKind,
    spawn_x: f32,
    spawn_y: f32,
    economy: &mut TokenEconomy,
) -> Result<hecs::Entity, String> {
    let cost = match tier {
        AgentTierKind::Apprentice => 20,
        AgentTierKind::Journeyman => 60,
        AgentTierKind::Artisan => 150,
        AgentTierKind::Architect => 400,
    };

    if economy.balance < cost {
        return Err(format!("insufficient tokens: need {}, have {}", cost, economy.balance));
    }

    economy.balance -= cost;

    let mut rng = rand::thread_rng();
    let name = FIRST_NAMES[rng.gen_range(0..FIRST_NAMES.len())].to_string();

    let stats = match tier {
        AgentTierKind::Apprentice => AgentStats {
            reliability: 0.5 + rng.gen::<f32>() * 0.15,
            speed: 0.8 + rng.gen::<f32>() * 0.2,
            awareness: 60.0 + rng.gen::<f32>() * 20.0,
            resilience: 40.0 + rng.gen::<f32>() * 15.0,
        },
        AgentTierKind::Journeyman => AgentStats {
            reliability: 0.65 + rng.gen::<f32>() * 0.15,
            speed: 1.0 + rng.gen::<f32>() * 0.3,
            awareness: 80.0 + rng.gen::<f32>() * 25.0,
            resilience: 60.0 + rng.gen::<f32>() * 20.0,
        },
        AgentTierKind::Artisan => AgentStats {
            reliability: 0.8 + rng.gen::<f32>() * 0.1,
            speed: 1.2 + rng.gen::<f32>() * 0.3,
            awareness: 100.0 + rng.gen::<f32>() * 30.0,
            resilience: 80.0 + rng.gen::<f32>() * 25.0,
        },
        AgentTierKind::Architect => AgentStats {
            reliability: 0.9 + rng.gen::<f32>() * 0.08,
            speed: 1.4 + rng.gen::<f32>() * 0.3,
            awareness: 120.0 + rng.gen::<f32>() * 30.0,
            resilience: 100.0 + rng.gen::<f32>() * 30.0,
        },
    };

    let entity = world.spawn((
        Agent,
        Position { x: spawn_x, y: spawn_y },
        Velocity::default(),
        Collider { radius: 5.0 },
        Health { current: stats.resilience as i32, max: stats.resilience as i32 },
        stats,
        AgentState { state: AgentStateKind::Idle },
        AgentMorale { value: 0.7 },
        AgentXP { xp: 0, level: 1 },
        AgentTier { tier },
        AgentName { name },
        VoiceProfile { voice_id: "placeholder".to_string() },
    ));

    Ok(entity)
}

pub fn assign_task(world: &mut World, agent_entity: hecs::Entity, task: TaskAssignment) -> Result<(), String> {
    let state = world.get::<&mut AgentState>(agent_entity)
        .map_err(|_| "agent not found".to_string())?;

    if state.state == AgentStateKind::Unresponsive {
        return Err("agent is unresponsive".to_string());
    }

    match &task {
        TaskAssignment::Build { .. } => state.state = AgentStateKind::Building,
        TaskAssignment::Explore => state.state = AgentStateKind::Exploring,
        TaskAssignment::Guard => state.state = AgentStateKind::Defending,
        TaskAssignment::Crank => state.state = AgentStateKind::Building, // reuse building state for crank
        TaskAssignment::Idle => state.state = AgentStateKind::Idle,
    }

    drop(state);

    // Insert or replace assignment component
    let _ = world.insert_one(agent_entity, Assignment { task });

    Ok(())
}
```

**Step 2: Update game/mod.rs**

```rust
pub mod tilemap;
pub mod fog;
pub mod agents;
```

**Step 3: Verify and commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/game/agents.rs server/src/game/mod.rs
git commit -m "feat: agent recruitment and task assignment system"
```

---

### Task 9: Building System — Construction & Completion

**Files:**
- Create: `server/src/game/building.rs`
- Create: `server/src/ecs/systems/building.rs`
- Modify: `server/src/game/mod.rs`
- Modify: `server/src/ecs/systems/mod.rs`

**Step 1: Create building definitions**

Create `server/src/game/building.rs`:

```rust
use crate::protocol::BuildingTypeKind;
use crate::ecs::components::*;

pub struct BuildingDefinition {
    pub kind: BuildingTypeKind,
    pub name: &'static str,
    pub tier: u8,
    pub token_cost: i64,
    pub build_time: f32, // total construction points needed
    pub width: u32,      // tiles
    pub height: u32,
    pub light_source: Option<(f32, (f32, f32, f32))>, // (radius, (r,g,b))
    pub effects: Vec<BuildingEffect>,
    pub description: &'static str,
}

pub fn get_building_definition(kind: &BuildingTypeKind) -> BuildingDefinition {
    use BuildingTypeKind::*;
    match kind {
        Pylon => BuildingDefinition {
            kind: Pylon, name: "Pylon", tier: 0, token_cost: 30,
            build_time: 100.0, width: 2, height: 2,
            light_source: Some((200.0, (1.0, 0.85, 0.4))), // warm amber
            effects: vec![],
            description: "Illuminates surrounding area. Safety.",
        },
        ComputeFarm => BuildingDefinition {
            kind: ComputeFarm, name: "Compute Farm", tier: 0, token_cost: 80,
            build_time: 300.0, width: 3, height: 3,
            light_source: None,
            effects: vec![BuildingEffect::PassiveIncome(0.5)],
            description: "Passive token generation. The backbone.",
        },
        TodoApp => BuildingDefinition {
            kind: TodoApp, name: "Todo App", tier: 1, token_cost: 15,
            build_time: 50.0, width: 2, height: 2,
            light_source: None,
            effects: vec![BuildingEffect::PassiveIncome(0.02)],
            description: "task: survive. status: in progress.",
        },
        Calculator => BuildingDefinition {
            kind: Calculator, name: "Calculator", tier: 1, token_cost: 20,
            build_time: 60.0, width: 2, height: 2,
            light_source: None,
            effects: vec![],
            description: "Unlocks projected income/expenditure display.",
        },
        LandingPage => BuildingDefinition {
            kind: LandingPage, name: "Landing Page", tier: 1, token_cost: 25,
            build_time: 80.0, width: 2, height: 2,
            light_source: None,
            effects: vec![BuildingEffect::AgentMoraleBoost(0.05)],
            description: "Purely aesthetic. Does nothing useful. Beloved.",
        },
        PortfolioSite => BuildingDefinition {
            kind: PortfolioSite, name: "Portfolio Site", tier: 1, token_cost: 30,
            build_time: 90.0, width: 2, height: 2,
            light_source: None,
            effects: vec![BuildingEffect::PassiveIncome(0.05)],
            description: "Early income. Draws NPC wanderers.",
        },
        PomodoroTimer => BuildingDefinition {
            kind: PomodoroTimer, name: "Pomodoro Timer", tier: 1, token_cost: 20,
            build_time: 70.0, width: 1, height: 2,
            light_source: None,
            effects: vec![BuildingEffect::CrankHeatReduction(0.3)],
            description: "Reduces crank heat buildup. Little clocktower.",
        },
        Database => BuildingDefinition {
            kind: Database, name: "Database", tier: 2, token_cost: 100,
            build_time: 400.0, width: 3, height: 3,
            light_source: None,
            effects: vec![BuildingEffect::ErrorRateReduction(0.15)],
            description: "Passive agent memory. Reduces error rate across all agents.",
        },
        TransformerModel => BuildingDefinition {
            kind: TransformerModel, name: "Transformer Model", tier: 4, token_cost: 1000,
            build_time: 2000.0, width: 5, height: 5,
            light_source: Some((100.0, (1.0, 0.95, 0.8))),
            effects: vec![BuildingEffect::PassiveIncome(3.0)],
            description: "The cathedral. When finished, the village light shifts slightly warmer.",
        },
        // Default for unimplemented buildings
        _ => BuildingDefinition {
            kind: kind.clone(), name: "Unknown Building", tier: 0, token_cost: 50,
            build_time: 200.0, width: 2, height: 2,
            light_source: None,
            effects: vec![],
            description: "Coming soon.",
        },
    }
}
```

**Step 2: Create building construction system**

Create `server/src/ecs/systems/building.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::*;

pub struct BuildingSystemResult {
    pub completed_buildings: Vec<(hecs::Entity, BuildingTypeKind)>,
    pub log_entries: Vec<String>,
}

pub fn building_system(world: &mut World) -> BuildingSystemResult {
    let mut result = BuildingSystemResult {
        completed_buildings: vec![],
        log_entries: vec![],
    };

    // Collect building entities that have assigned agents working on them
    let mut buildings_to_update: Vec<(hecs::Entity, f32)> = Vec::new();

    // Find agents that are building and their assigned buildings
    for (_agent_id, (_, agent_state, stats, assignment)) in
        world.query::<(&Agent, &AgentState, &AgentStats, &Assignment)>().iter()
    {
        if agent_state.state == AgentStateKind::Building {
            if let TaskAssignment::Build { building_id } = &assignment.task {
                // Convert EntityId back to hecs::Entity
                let entity = hecs::Entity::from_bits(*building_id).unwrap();
                buildings_to_update.push((entity, stats.speed));
            }
        }
    }

    // Apply construction progress
    for (building_entity, agent_speed) in buildings_to_update {
        if let Ok(progress) = world.get::<&mut ConstructionProgress>(building_entity) {
            if progress.current < progress.total {
                progress.current += agent_speed;
                if progress.current >= progress.total {
                    progress.current = progress.total;
                    // Get building type for the completion log
                    if let Ok(bt) = world.get::<&BuildingType>(building_entity) {
                        result.completed_buildings.push((building_entity, bt.kind.clone()));
                        result.log_entries.push(format!("[build] {:?} complete", bt.kind));
                    }
                }
            }
        }
    }

    result
}
```

**Step 3: Update mod files and verify**

Update `server/src/ecs/systems/mod.rs`:

```rust
pub mod crank;
pub mod economy;
pub mod building;
```

Update `server/src/game/mod.rs`:

```rust
pub mod tilemap;
pub mod fog;
pub mod agents;
pub mod building;
```

Run: `cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build`

**Step 4: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/game/building.rs server/src/ecs/systems/building.rs server/src/ecs/systems/mod.rs server/src/game/mod.rs
git commit -m "feat: building definitions, construction progress, and building system"
```

---

## Phase 4: Combat & Rogue AI

---

### Task 10: Rogue AI Spawning & Behavior State Machines

**Files:**
- Create: `server/src/ai/mod.rs`
- Create: `server/src/ai/rogue_ai.rs`
- Create: `server/src/ecs/systems/spawn.rs`
- Modify: `server/src/lib.rs`
- Modify: `server/src/ecs/systems/mod.rs`

**Step 1: Create rogue AI behavior module**

Create directory: `mkdir -p server/src/ai`

Create `server/src/ai/mod.rs`:

```rust
pub mod rogue_ai;
```

Create `server/src/ai/rogue_ai.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::*;

pub fn rogue_ai_system(world: &mut World) {
    // Collect rogue data first to avoid borrow conflicts
    let rogues: Vec<(hecs::Entity, RogueTypeKind, RogueBehaviorState, f32, f32)> = world
        .query::<(&Rogue, &RogueType, &RogueAI, &Position)>()
        .iter()
        .map(|(id, (_, rt, ai, pos))| (id, rt.kind.clone(), ai.behavior_state.clone(), pos.x, pos.y))
        .collect();

    // Find nearest light source or agent for each rogue
    let targets: Vec<(f32, f32)> = world
        .query::<(&Agent, &Position)>()
        .iter()
        .map(|(_, (_, pos))| (pos.x, pos.y))
        .collect();

    let player_pos: Option<(f32, f32)> = world
        .query::<(&Player, &Position)>()
        .iter()
        .next()
        .map(|(_, (_, pos))| (pos.x, pos.y));

    for (entity, rogue_type, behavior, rx, ry) in rogues {
        let speed = match rogue_type {
            RogueTypeKind::Swarm => 1.5,
            RogueTypeKind::Assassin => 3.0,
            RogueTypeKind::Corruptor => 0.8,
            RogueTypeKind::Looper => 1.0,
            RogueTypeKind::TokenDrain => 0.5,
            RogueTypeKind::Mimic => 0.0, // stationary until triggered
            RogueTypeKind::Architect => 0.6,
        };

        // Find nearest target
        let nearest = targets.iter()
            .chain(player_pos.as_ref().map(|p| p).into_iter())
            .min_by(|a, b| {
                let da = (a.0 - rx).powi(2) + (a.1 - ry).powi(2);
                let db = (b.0 - rx).powi(2) + (b.1 - ry).powi(2);
                da.partial_cmp(&db).unwrap()
            });

        if let Some(&(tx, ty)) = nearest {
            let dx = tx - rx;
            let dy = ty - ry;
            let dist = (dx * dx + dy * dy).sqrt();

            if dist > 0.0 {
                let move_x = (dx / dist) * speed;
                let move_y = (dy / dist) * speed;

                if let Ok(mut pos) = world.get::<&mut Position>(entity) {
                    pos.x += move_x;
                    pos.y += move_y;
                }

                // Update behavior state based on distance
                if let Ok(mut ai) = world.get::<&mut RogueAI>(entity) {
                    if dist < 20.0 {
                        ai.behavior_state = RogueBehaviorState::Attacking;
                    } else if dist < 200.0 {
                        ai.behavior_state = RogueBehaviorState::Approaching;
                    } else {
                        ai.behavior_state = RogueBehaviorState::Wandering;
                    }
                }
            }
        }
    }
}
```

**Step 2: Create spawn system**

Create `server/src/ecs/systems/spawn.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::*;
use rand::Rng;

pub fn spawn_system(world: &mut World, game_state: &GameState, player_x: f32, player_y: f32) {
    let mut rng = rand::thread_rng();

    // Spawn rate based on village activity
    let base_rate = match game_state.phase {
        GamePhase::Hut => 0.002,
        GamePhase::Outpost => 0.005,
        GamePhase::Village => 0.01,
        GamePhase::Network => 0.02,
        GamePhase::City => 0.03,
    };

    // Count active buildings
    let building_count = world.query::<(&Building,)>().iter().count() as f64;
    let spawn_chance = base_rate + building_count * 0.002;

    if rng.gen::<f64>() > spawn_chance {
        return; // no spawn this tick
    }

    // Choose spawn position at edge of darkness (offset from player)
    let angle: f32 = rng.gen::<f32>() * std::f32::consts::TAU;
    let dist: f32 = 300.0 + rng.gen::<f32>() * 200.0;
    let sx = player_x + angle.cos() * dist;
    let sy = player_y + angle.sin() * dist;

    // Choose rogue type based on game phase
    let rogue_type = match game_state.phase {
        GamePhase::Hut => {
            if rng.gen::<f32>() < 0.7 { RogueTypeKind::Swarm } else { RogueTypeKind::Corruptor }
        }
        GamePhase::Outpost => {
            let r: f32 = rng.gen();
            if r < 0.4 { RogueTypeKind::Swarm }
            else if r < 0.7 { RogueTypeKind::Corruptor }
            else if r < 0.85 { RogueTypeKind::Looper }
            else { RogueTypeKind::TokenDrain }
        }
        _ => {
            let r: f32 = rng.gen();
            if r < 0.25 { RogueTypeKind::Swarm }
            else if r < 0.45 { RogueTypeKind::Corruptor }
            else if r < 0.6 { RogueTypeKind::Looper }
            else if r < 0.75 { RogueTypeKind::TokenDrain }
            else if r < 0.85 { RogueTypeKind::Assassin }
            else if r < 0.95 { RogueTypeKind::Mimic }
            else { RogueTypeKind::Architect }
        }
    };

    let (hp, dmg) = match &rogue_type {
        RogueTypeKind::Swarm => (15, 3),
        RogueTypeKind::Corruptor => (40, 5),
        RogueTypeKind::Looper => (25, 2),
        RogueTypeKind::TokenDrain => (20, 1),
        RogueTypeKind::Assassin => (35, 15),
        RogueTypeKind::Mimic => (30, 8),
        RogueTypeKind::Architect => (80, 10),
    };

    world.spawn((
        Rogue,
        Position { x: sx, y: sy },
        Velocity::default(),
        Collider { radius: 6.0 },
        Health { current: hp, max: hp },
        RogueType { kind: rogue_type.clone() },
        RogueAI {
            behavior_state: RogueBehaviorState::Wandering,
            target: None,
        },
        RogueVisibility {
            visible: rogue_type != RogueTypeKind::TokenDrain,
        },
    ));
}
```

**Step 3: Update mod files and lib.rs**

Update `server/src/lib.rs`:

```rust
pub mod protocol;
pub mod network;
pub mod ecs;
pub mod game;
pub mod ai;
```

Update `server/src/ecs/systems/mod.rs`:

```rust
pub mod crank;
pub mod economy;
pub mod building;
pub mod spawn;
```

**Step 4: Verify and commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/ai/ server/src/ecs/systems/spawn.rs server/src/ecs/systems/mod.rs server/src/lib.rs
git commit -m "feat: rogue AI behavior state machines and spawn system"
```

---

### Task 11: Combat System — Damage Resolution

**Files:**
- Create: `server/src/ecs/systems/combat.rs`
- Modify: `server/src/ecs/systems/mod.rs`

**Step 1: Create combat system**

Create `server/src/ecs/systems/combat.rs`:

```rust
use hecs::World;
use crate::ecs::components::*;
use crate::protocol::*;

pub struct CombatResult {
    pub killed_rogues: Vec<(hecs::Entity, RogueTypeKind)>,
    pub killed_agents: Vec<(hecs::Entity, String)>,
    pub player_damaged: bool,
    pub log_entries: Vec<String>,
    pub audio_events: Vec<AudioEvent>,
}

pub fn combat_system(world: &mut World, player_attacking: bool) -> CombatResult {
    let mut result = CombatResult {
        killed_rogues: vec![],
        killed_agents: vec![],
        player_damaged: false,
        log_entries: vec![],
        audio_events: vec![],
    };

    // Get player position and combat stats
    let player_data: Option<(hecs::Entity, f32, f32, i32, f32)> = world
        .query::<(&Player, &Position, &CombatPower)>()
        .iter()
        .next()
        .map(|(id, (_, pos, combat))| (id, pos.x, pos.y, combat.base_damage, combat.attack_speed));

    let Some((player_entity, px, py, player_dmg, _attack_speed)) = player_data else {
        return result;
    };

    // Collect rogues for combat checks
    let rogues: Vec<(hecs::Entity, f32, f32, i32, RogueTypeKind)> = world
        .query::<(&Rogue, &Position, &Health, &RogueType)>()
        .iter()
        .map(|(id, (_, pos, hp, rt))| (id, pos.x, pos.y, hp.current, rt.kind.clone()))
        .collect();

    // Player attacks nearby rogues
    if player_attacking {
        let attack_range = 30.0_f32;
        for (rogue_entity, rx, ry, _hp, rogue_type) in &rogues {
            let dist = ((px - rx).powi(2) + (py - ry).powi(2)).sqrt();
            if dist < attack_range {
                if let Ok(mut health) = world.get::<&mut Health>(*rogue_entity) {
                    health.current -= player_dmg;
                    result.audio_events.push(AudioEvent::CombatHit {
                        position: Vec2 { x: *rx, y: *ry },
                    });
                    if health.current <= 0 {
                        result.killed_rogues.push((*rogue_entity, rogue_type.clone()));
                        result.log_entries.push(format!("[combat] {:?} terminated", rogue_type));
                    }
                }
            }
        }
    }

    // Rogues attack player if close enough
    for (rogue_entity, rx, ry, _hp, rogue_type) in &rogues {
        let dist = ((px - rx).powi(2) + (py - ry).powi(2)).sqrt();
        let attack_range = 20.0;
        if dist < attack_range {
            let dmg = match rogue_type {
                RogueTypeKind::Swarm => 1,
                RogueTypeKind::Corruptor => 2,
                RogueTypeKind::Looper => 1,
                RogueTypeKind::Assassin => 5,
                RogueTypeKind::Mimic => 3,
                _ => 1,
            };
            if let Ok(mut player_health) = world.get::<&mut Health>(player_entity) {
                player_health.current -= dmg;
                result.player_damaged = true;
            }
        }
    }

    // Rogues attack nearby agents
    let agents: Vec<(hecs::Entity, f32, f32, String)> = world
        .query::<(&Agent, &Position, &AgentName)>()
        .iter()
        .map(|(id, (_, pos, name))| (id, pos.x, pos.y, name.name.clone()))
        .collect();

    for (_rogue_entity, rx, ry, _hp, rogue_type) in &rogues {
        for (agent_entity, ax, ay, agent_name) in &agents {
            let dist = ((rx - ax).powi(2) + (ry - ay).powi(2)).sqrt();
            if dist < 25.0 {
                let dmg = match rogue_type {
                    RogueTypeKind::Assassin => 8,
                    RogueTypeKind::Corruptor => 3,
                    _ => 2,
                };
                if let Ok(mut health) = world.get::<&mut Health>(*agent_entity) {
                    health.current -= dmg;
                    if health.current <= 0 {
                        // Agent death
                        if let Ok(mut state) = world.get::<&mut AgentState>(*agent_entity) {
                            state.state = AgentStateKind::Unresponsive;
                        }
                        result.killed_agents.push((*agent_entity, agent_name.clone()));
                        result.log_entries.push(format!("[agent_{}] has stopped responding.", agent_name));
                        result.audio_events.push(AudioEvent::AgentDeath { agent_id: agent_entity.to_bits().into() });
                    }
                }
            }
        }
    }

    // Despawn killed rogues
    for (entity, rogue_type) in &result.killed_rogues {
        let _ = world.despawn(*entity);
    }

    result
}
```

**Step 2: Update systems mod**

```rust
pub mod crank;
pub mod economy;
pub mod building;
pub mod spawn;
pub mod combat;
```

**Step 3: Verify and commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/server && cargo build
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/ecs/systems/combat.rs server/src/ecs/systems/mod.rs
git commit -m "feat: combat system with damage resolution, player/agent/rogue interactions"
```

---

## Phase 5: Client UI & Rendering

---

### Task 12: Client Entity Rendering (Agents, Buildings, Rogues)

**Files:**
- Create: `client/src/renderer/entities.ts`
- Modify: `client/src/main.ts` — integrate entity rendering from server state

**Step 1: Create entity renderer**

Create `client/src/renderer/entities.ts`:

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { EntityDelta, EntityData, AgentStateKind } from '../network/protocol';

const LABEL_STYLE = new TextStyle({
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 10,
  fill: 0xcccccc,
});

interface EntitySprite {
  container: Container;
  graphic: Graphics;
  label: Text;
  lastKind: string;
}

export class EntityRenderer {
  container: Container;
  private entities: Map<number, EntitySprite> = new Map();

  constructor() {
    this.container = new Container();
  }

  update(changed: EntityDelta[], removed: number[]) {
    // Remove despawned entities
    for (const id of removed) {
      const sprite = this.entities.get(id);
      if (sprite) {
        this.container.removeChild(sprite.container);
        sprite.graphic.destroy();
        sprite.label.destroy();
        sprite.container.destroy();
        this.entities.delete(id);
      }
    }

    // Update or create entities
    for (const delta of changed) {
      let sprite = this.entities.get(delta.id);
      if (!sprite) {
        sprite = this.createEntitySprite(delta);
        this.entities.set(delta.id, sprite);
        this.container.addChild(sprite.container);
      }

      // Update position
      sprite.container.x = delta.position.x;
      sprite.container.y = delta.position.y;

      // Update visual based on data
      this.updateEntityVisual(sprite, delta);
    }
  }

  private createEntitySprite(delta: EntityDelta): EntitySprite {
    const container = new Container();
    const graphic = new Graphics();
    const label = new Text({ text: '', style: LABEL_STYLE });
    label.y = -18;
    label.anchor.set(0.5, 0);

    container.addChild(graphic);
    container.addChild(label);

    return { container, graphic, label, lastKind: '' };
  }

  private updateEntityVisual(sprite: EntitySprite, delta: EntityDelta) {
    sprite.graphic.clear();

    if ('Agent' in delta.data) {
      const agent = delta.data.Agent;
      const color = this.getAgentColor(agent.state);
      sprite.graphic.circle(0, 0, 6);
      sprite.graphic.fill(color);

      // Morale indicator ring
      if (agent.morale_pct < 0.3) {
        sprite.graphic.circle(0, 0, 8);
        sprite.graphic.stroke({ color: 0xff4444, width: 1, alpha: 0.6 });
      }

      sprite.label.text = `[${agent.name}]`;
      sprite.label.style.fill = color;

    } else if ('Building' in delta.data) {
      const building = delta.data.Building;
      const size = 12;
      const progress = building.construction_pct;

      if (progress < 1.0) {
        // Under construction — outline with fill showing progress
        sprite.graphic.rect(-size / 2, -size / 2, size, size);
        sprite.graphic.stroke({ color: 0xd4a017, width: 1 });
        sprite.graphic.rect(-size / 2, -size / 2, size * progress, size);
        sprite.graphic.fill({ color: 0xd4a017, alpha: 0.5 });
      } else {
        // Complete — solid gold
        sprite.graphic.rect(-size / 2, -size / 2, size, size);
        sprite.graphic.fill(0xd4a017);
      }

      sprite.label.text = building.building_type;
      sprite.label.style.fill = 0xd4a017;

    } else if ('Rogue' in delta.data) {
      const rogue = delta.data.Rogue;
      const color = this.getRogueColor(rogue.rogue_type);

      // Rogues are angular — diamond shape
      sprite.graphic.moveTo(0, -7);
      sprite.graphic.lineTo(7, 0);
      sprite.graphic.lineTo(0, 7);
      sprite.graphic.lineTo(-7, 0);
      sprite.graphic.closePath();
      sprite.graphic.fill(color);

      sprite.label.text = rogue.rogue_type;
      sprite.label.style.fill = color;

    } else if ('Item' in delta.data) {
      const item = delta.data.Item;
      sprite.graphic.star(0, 0, 4, 5, 3);
      sprite.graphic.fill(0xffdd44);
      sprite.label.text = item.item_type;
    }
  }

  private getAgentColor(state: AgentStateKind): number {
    switch (state) {
      case 'Idle': return 0xccaa44;      // amber/gold
      case 'Building': return 0x44cc66;   // green
      case 'Erroring': return 0xff6644;   // orange-red
      case 'Exploring': return 0x6688cc;  // blue
      case 'Defending': return 0xcc4444;  // red
      case 'Critical': return 0xff0000;   // bright red, pulsing
      case 'Unresponsive': return 0x444444; // grey — dead
      default: return 0xcccccc;
    }
  }

  private getRogueColor(type_: string): number {
    switch (type_) {
      case 'Corruptor': return 0xcc44cc;    // magenta
      case 'Looper': return 0x44cccc;       // cyan
      case 'TokenDrain': return 0x88cc44;   // sickly green
      case 'Assassin': return 0xff2222;     // bright red
      case 'Swarm': return 0x886644;        // brown
      case 'Mimic': return 0xd4a017;        // gold (disguised)
      case 'Architect': return 0x8844cc;    // purple
      default: return 0xff0000;
    }
  }
}
```

**Step 2: Integrate into main.ts — update the game loop to render entities from server state**

This requires updating the main.ts to create an EntityRenderer instance and call `update()` on each frame with the latest server state entities.

**Step 3: Verify and commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add client/src/renderer/entities.ts
git commit -m "feat: client entity renderer for agents, buildings, rogues with placeholder shapes"
```

---

### Task 13: HUD — Token Counter, Health Bar, Log Feed

**Files:**
- Create: `client/src/ui/hud.ts`
- Create: `client/src/ui/log-feed.ts`

**Step 1: Create HUD**

Create directory: `mkdir -p client/src/ui`

Create `client/src/ui/hud.ts`:

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { PlayerSnapshot, EconomySnapshot } from '../network/protocol';

const MONO_STYLE = new TextStyle({
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 14,
  fill: 0xd4a017,
});

const HEALTH_STYLE = new TextStyle({
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 12,
  fill: 0xcc4444,
});

export class HUD {
  container: Container;
  private tokenText: Text;
  private healthBar: Graphics;
  private healthText: Text;
  private incomeText: Text;

  constructor() {
    this.container = new Container();

    // Token counter — top right
    this.tokenText = new Text({ text: '0', style: MONO_STYLE });
    this.tokenText.x = 20;
    this.tokenText.y = 20;
    this.container.addChild(this.tokenText);

    // Health bar — top left
    this.healthBar = new Graphics();
    this.healthBar.x = 20;
    this.healthBar.y = 50;
    this.container.addChild(this.healthBar);

    this.healthText = new Text({ text: 'HP: 100/100', style: HEALTH_STYLE });
    this.healthText.x = 20;
    this.healthText.y = 68;
    this.container.addChild(this.healthText);

    // Income/expenditure
    this.incomeText = new Text({ text: '', style: new TextStyle({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 11,
      fill: 0x888888,
    })});
    this.incomeText.x = 20;
    this.incomeText.y = 88;
    this.container.addChild(this.incomeText);
  }

  update(player: PlayerSnapshot, economy: EconomySnapshot) {
    this.tokenText.text = `tokens: ${economy.balance}`;

    // Health bar
    this.healthBar.clear();
    const barWidth = 150;
    const barHeight = 12;
    const healthPct = player.health / player.max_health;

    // Background
    this.healthBar.rect(0, 0, barWidth, barHeight);
    this.healthBar.fill({ color: 0x333333 });

    // Fill
    const healthColor = healthPct > 0.5 ? 0x44cc44 : healthPct > 0.25 ? 0xcccc44 : 0xcc4444;
    this.healthBar.rect(0, 0, barWidth * healthPct, barHeight);
    this.healthBar.fill(healthColor);

    this.healthText.text = `HP: ${player.health}/${player.max_health}`;

    // Income
    const net = economy.income_per_sec - economy.expenditure_per_sec;
    const sign = net >= 0 ? '+' : '';
    this.incomeText.text = `+${economy.income_per_sec.toFixed(1)}/s  -${economy.expenditure_per_sec.toFixed(1)}/s  (${sign}${net.toFixed(1)}/s)`;
  }
}
```

**Step 2: Create log feed**

Create `client/src/ui/log-feed.ts`:

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { LogEntry } from '../network/protocol';

const LOG_STYLE = new TextStyle({
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  fill: 0xaaaaaa,
  wordWrap: true,
  wordWrapWidth: 280,
});

const MAX_LINES = 20;

export class LogFeed {
  container: Container;
  private background: Graphics;
  private lines: Text[] = [];
  private entries: string[] = [];

  constructor(screenWidth: number, screenHeight: number) {
    this.container = new Container();

    // Parchment-style background on the right side
    this.background = new Graphics();
    const width = 300;
    const height = screenHeight - 40;
    this.background.rect(0, 0, width, height);
    this.background.fill({ color: 0x1a1510, alpha: 0.85 });
    this.background.stroke({ color: 0x3a3020, width: 1 });

    this.container.x = screenWidth - width - 20;
    this.container.y = 20;
    this.container.addChild(this.background);
  }

  addEntries(entries: LogEntry[]) {
    for (const entry of entries) {
      const prefix = this.getCategoryPrefix(entry.category);
      this.entries.push(`${prefix} ${entry.text}`);
    }

    // Trim to max
    while (this.entries.length > MAX_LINES) {
      this.entries.shift();
    }

    this.render();
  }

  private render() {
    // Clear old text
    for (const line of this.lines) {
      line.destroy();
    }
    this.lines = [];

    let y = 10;
    for (const text of this.entries) {
      const line = new Text({ text, style: LOG_STYLE });
      line.x = 10;
      line.y = y;
      this.container.addChild(line);
      this.lines.push(line);
      y += line.height + 2;
    }
  }

  private getCategoryPrefix(category: string): string {
    switch (category) {
      case 'System': return '[sys]';
      case 'Agent': return '[agt]';
      case 'Combat': return '[cmb]';
      case 'Economy': return '[eco]';
      case 'Exploration': return '[exp]';
      case 'Building': return '[bld]';
      default: return '[???]';
    }
  }
}
```

**Step 3: Verify and commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game/client && npx tsc --noEmit
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add client/src/ui/
git commit -m "feat: HUD with token counter, health bar, and scrolling log feed"
```

---

### Task 14: Integrate Full Game Loop — Server Systems + Client Rendering

**Files:**
- Modify: `server/src/main.rs` — integrate all systems into the tick loop
- Modify: `client/src/main.ts` — integrate all renderers and UI

This is the integration task. Wire all server systems (input, movement, combat, building, economy, crank, spawn, fog) into the main loop. Wire all client renderers (world, entities, lighting, HUD, log feed) into the render loop. Test the full client-server interaction.

**Step 1: Update server main.rs with full system pipeline**

Integrate all systems from Tasks 5-11 into the game loop in the correct order:
1. Process player input (movement + actions)
2. Run rogue AI behavior
3. Run spawn system
4. Run combat system
5. Run building system
6. Run economy system
7. Run crank system
8. Update fog of war
9. Build state delta and send to client

**Step 2: Update client main.ts with full rendering pipeline**

Integrate EntityRenderer, HUD, LogFeed, WorldRenderer into the main game loop.

**Step 3: Manual integration test**

Run server and client. Verify:
- Player moves with WASD
- Starting agent visible as amber circle
- Token counter displays and ticks
- Log feed shows system messages
- Rogues spawn and approach

**Step 4: Commit**

```bash
cd /Users/jackwakem/Desktop/random_shit/its-time-to-build-game
git add server/src/main.rs client/src/main.ts
git commit -m "feat: full game loop integration — server systems pipeline + client rendering"
```

---

## Phase 6: Exploration, Buildings Menu, and Progression

---

### Task 15: Procedural World Generation with Chunk Loading

**Files:**
- Modify: `server/src/game/tilemap.rs` — add scatter placement for discoveries
- Create: `server/src/game/exploration.rs` — exploration rewards, discoveries

Wire chunk generation to player position. Generate terrain + scatter blueprint fragments, token caches, rogue nests, and Mum's Credit Card on chunk generation.

---

### Task 16: Build Menu & Building Placement UI

**Files:**
- Create: `client/src/ui/menus.ts` — build menu overlay
- Modify: `client/src/main.ts` — handle build menu input (B key)

Create a build menu that shows available buildings, costs, and allows placement. Client sends `PlaceBuilding` action to server.

---

### Task 17: Progression System — Phase Transitions

**Files:**
- Create: `server/src/game/progression.rs`

Track building milestones and trigger phase transitions. Each phase unlocks new building tiers and increases rogue variety.

---

### Task 18: Upgrade Tree

**Files:**
- Create: `server/src/game/upgrades.rs`
- Create: `client/src/ui/upgrade-tree.ts`

Implement the 16 upgrades across 4 tiers. Each upgrade modifies game state (agent stats, crank behavior, spawn rates, etc.).

---

## Phase 7: Mistral Vibe Agent AI Integration

---

### Task 19: Mistral Vibe Integration for Agent Behavior

**Files:**
- Create: `server/src/ai/agent_ai.rs`
- Create: `server/src/ai/fallback.rs`

Integrate Mistral Vibe as the agent AI brain. Build context from agent state + village state, send async requests, queue decisions. Implement rule-based fallback for when API is unavailable.

---

## Phase 8: Audio System

---

### Task 20: Audio Manager & Spatial Audio

**Files:**
- Create: `client/src/audio/manager.ts`
- Create: `client/src/audio/ambient.ts`
- Create: `client/src/audio/sfx.ts`
- Create: `client/src/audio/voice.ts`

Web Audio API spatial audio. Server sends AudioEvent triggers, client plays corresponding sounds based on position relative to player. Voice system interface defined with placeholder audio, ready for ElevenLabs plug-in.

---

## Phase 9: Polish & The Cascade

---

### Task 21: The Cascade — Final Siege Event

**Files:**
- Modify: `server/src/game/progression.rs` — cascade trigger and wave system

Implement the climactic event. All enemy types spawn in coordinated waves. Survival ends the run with the final screen.

---

### Task 22: Grimoire — Agent Roster UI

**Files:**
- Create: `client/src/ui/grimoire.ts`

Book-style UI showing all agents with stats, XP, level, and recent log entries. Dead agents have torn pages.

---

### Task 23: Mum's Credit Card System

**Files:**
- Modify: `server/src/game/exploration.rs`

Implement all 4 variants, cooldown system, and the follow-up "we need to talk" note.

---

## Summary

**23 tasks across 9 phases.** Phase 1-4 are the critical path — they produce a playable game loop. Phases 5-9 layer on features.

**Critical path to first playable:**
Tasks 1-4 (scaffolding + connectivity) → Task 5 (ECS) → Task 7 (crank) → Task 10-11 (rogues + combat) → Task 14 (integration)

That gives you: move a dot, crank tokens, rogues spawn and attack, you fight back. The core loop.
