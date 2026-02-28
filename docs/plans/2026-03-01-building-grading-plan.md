# Building Grading System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 1-6 star grading system for app buildings where an LLM (Claude API) evaluates source code quality and the grade multiplies token income.

**Architecture:** Server-side GradingService reads project source files, sends them to Claude API with per-app-type rubrics, stores the grade, and applies a multiplier in the economy system. Client adds a "Grade" button to BuildingPanel and shows star ratings.

**Tech Stack:** Rust (server, reqwest for HTTP), TypeScript (client UI), Claude API (sonnet for grading)

---

### Task 1: Add reqwest dependency to server

**Files:**
- Modify: `server/Cargo.toml`

**Step 1: Add reqwest with json and rustls-tls features**

In `server/Cargo.toml`, add to `[dependencies]`:
```toml
reqwest = { version = "0.12", features = ["json", "rustls-tls"] }
```

**Step 2: Verify it compiles**

Run: `cd server && cargo check`
Expected: Compiles successfully (may take a moment to download reqwest)

**Step 3: Commit**

```bash
git add server/Cargo.toml server/Cargo.lock
git commit -m "chore: add reqwest dependency for Claude API grading"
```

---

### Task 2: Add protocol types for grading

**Files:**
- Modify: `server/src/protocol.rs`
- Modify: `client/src/network/protocol.ts`

**Step 1: Add Rust protocol types**

In `server/src/protocol.rs`, add the `BuildingGradeState` struct after `ProjectManagerState`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingGradeState {
    pub stars: u8,
    pub reasoning: String,
    pub grading: bool,
}
```

Add `building_grades` field to `ProjectManagerState`:

```rust
pub struct ProjectManagerState {
    pub base_dir: Option<String>,
    pub initialized: bool,
    pub unlocked_buildings: Vec<String>,
    pub building_statuses: HashMap<String, String>,
    pub agent_assignments: HashMap<String, Vec<u64>>,
    pub building_grades: HashMap<String, BuildingGradeState>,  // NEW
}
```

Add new `PlayerAction` variants (before the closing `}`):

```rust
// Grading actions
GradeBuilding { building_id: String },
SetAnthropicApiKey { key: String },
```

Add new `ServerMessage` variant:

```rust
/// Grade result from LLM evaluation.
GradeResult { building_id: String, stars: u8, reasoning: String },
```

**Step 2: Add TypeScript protocol types**

In `client/src/network/protocol.ts`, add after `ProjectManagerState`:

```typescript
export interface BuildingGradeState {
  stars: number;
  reasoning: string;
  grading: boolean;
}
```

Add `building_grades` to `ProjectManagerState`:

```typescript
export interface ProjectManagerState {
  base_dir: string | null;
  initialized: boolean;
  unlocked_buildings: string[];
  building_statuses: Record<string, string>;
  agent_assignments: Record<string, number[]>;
  building_grades: Record<string, BuildingGradeState>;  // NEW
}
```

Add to `PlayerAction` union (after `SetMistralApiKey` line):

```typescript
| { GradeBuilding: { building_id: string } }
| { SetAnthropicApiKey: { key: string } };
```

Add to `ServerMessage` union:

```typescript
| { GradeResult: { building_id: string; stars: number; reasoning: string } };
```

**Step 3: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles (main.rs will have warnings about unmatched patterns — that's fine, we'll handle them in later tasks)

**Step 4: Commit**

```bash
git add server/src/protocol.rs client/src/network/protocol.ts
git commit -m "feat: add protocol types for building grading system"
```

---

### Task 3: Create grading rubrics module

**Files:**
- Create: `server/src/grading/rubrics.rs`

**Step 1: Create the rubrics file**

Create `server/src/grading/rubrics.rs` with per-app-type grading rubrics:

```rust
/// Returns the grading rubric for a given building id.
/// Each rubric describes what 1-6 stars looks like for that app type.
pub fn get_rubric(building_id: &str) -> &'static str {
    match building_id {
        "todo_app" => TODO_APP_RUBRIC,
        "calculator" => CALCULATOR_RUBRIC,
        "landing_page" => LANDING_PAGE_RUBRIC,
        "weather_dashboard" => WEATHER_DASHBOARD_RUBRIC,
        "chat_app" => CHAT_APP_RUBRIC,
        "kanban_board" => KANBAN_BOARD_RUBRIC,
        "ecommerce_store" => ECOMMERCE_STORE_RUBRIC,
        "ai_image_generator" => AI_IMAGE_GENERATOR_RUBRIC,
        "api_dashboard" => API_DASHBOARD_RUBRIC,
        "blockchain" => BLOCKCHAIN_RUBRIC,
        _ => DEFAULT_RUBRIC,
    }
}

const TODO_APP_RUBRIC: &str = r#"
GRADING RUBRIC - Todo App

1 STAR: Bare minimum. A basic HTML list or text input. No styling, broken or no state management. Barely functional.

2 STARS: Functional CRUD operations (add, complete, delete todos). Basic CSS styling applied. State managed but messy (e.g. raw DOM manipulation or minimal React state).

3 STARS: Clean component structure with proper React state management. Form validation (no empty todos). Responsive layout. Filter by status (all/active/completed). Todo counter.

4 STARS: Drag-and-drop reordering. Local storage persistence. Categories or tags. Search/filter functionality. Inline editing. Bulk operations (clear completed). Good UX polish.

5 STARS: Framer Motion animations (add/remove/reorder transitions). Dark mode with smooth toggle. Keyboard shortcuts (Ctrl+N new, Enter submit, etc). Undo/redo. Due dates with calendar picker. Priority levels with visual indicators.

6 STARS: All of 5-star PLUS: Stunning micro-interactions (checkbox ripple, stagger animations on load, spring physics on drag). Optimistic UI updates. PWA/offline support. Full accessibility (ARIA labels, focus management, screen reader support). Subtasks/nested todos. Import/export. Beautiful, production-grade design that looks like a shipped SaaS product.
"#;

const CALCULATOR_RUBRIC: &str = r#"
GRADING RUBRIC - Calculator

1 STAR: Basic arithmetic (+, -, *, /) with number buttons. Broken layout or logic errors.

2 STARS: Working basic arithmetic with clear/equals. Display shows current input. Buttons styled in a grid layout.

3 STARS: Scientific functions (sin, cos, tan, log, sqrt, power). Operator precedence handled correctly. History of last calculation. Responsive grid layout. Keyboard number input.

4 STARS: Full history tape/log showing all calculations. Memory store/recall (M+, M-, MR, MC). Parentheses support. Copy result to clipboard. Theming (light/dark or calculator skin).

5 STARS: Framer Motion button press animations and result transitions. Graphing mode (plot equations). Unit conversion panel. Programmers mode (hex/binary/octal). Smooth mode transitions with animations.

6 STARS: All of 5-star PLUS: Haptic-feel button animations with 3D press effects. LaTeX equation rendering. Calculation step-by-step breakdown. Expression tree visualization. Matrix operations. Complex number support. Gorgeous, professional design.
"#;

const LANDING_PAGE_RUBRIC: &str = r#"
GRADING RUBRIC - Landing Page

1 STAR: Plain HTML text content. No sections, no styling, no visual hierarchy.

2 STARS: Hero section with heading and CTA button. Features section with basic cards. Footer. Basic CSS styling and colors.

3 STARS: Responsive design (mobile + desktop). Proper visual hierarchy and typography. Navigation bar. Multiple sections (hero, features, testimonials, pricing, footer). Consistent color scheme.

4 STARS: Smooth scroll navigation. Feature icons/illustrations. Testimonial carousel. Pricing table with toggle (monthly/annual). Contact form. Social proof section. Professional spacing and typography.

5 STARS: Framer Motion scroll-triggered animations (fade in, slide up). Parallax hero background. Animated statistics counter. Hover micro-interactions on cards/buttons. Dark/light mode. Smooth page transitions.

6 STARS: All of 5-star PLUS: Complex scroll-driven animations (elements morphing, path animations). 3D card tilt effects. Animated gradient backgrounds. Particle effects or generative art hero. Interactive feature demos embedded in sections. Looks like an award-winning agency landing page (Awwwards-quality).
"#;

const WEATHER_DASHBOARD_RUBRIC: &str = r#"
GRADING RUBRIC - Weather Dashboard

1 STAR: Static text showing hardcoded weather data. No real structure or interactivity.

2 STARS: Location display with temperature, conditions, and basic weather icon. Styled card layout. Hardcoded or mock data is fine if well-presented.

3 STARS: Multi-day forecast (5-7 days). Current conditions detail (humidity, wind, pressure). Location search input. Weather icons per condition. Responsive grid layout. Loading states.

4 STARS: Hourly forecast chart/graph. Weather map or radar visualization. Multiple saved locations. Unit toggle (C/F). Sunrise/sunset times. UV index. Air quality. Detailed wind direction indicator.

5 STARS: Framer Motion animated weather transitions (sun/rain/snow particle effects). Animated charts with smooth data transitions. Dynamic background that changes with weather/time of day. Gesture-based navigation between days. Animated weather icons (not static).

6 STARS: All of 5-star PLUS: Real-time animated weather scene (rain drops, moving clouds, lightning flashes). Interactive globe or map with weather overlay. Smooth 60fps animations throughout. Weather alerts with dramatic entrance animations. Glass-morphism or neumorphism design. Truly beautiful, app-store quality weather experience.
"#;

const CHAT_APP_RUBRIC: &str = r#"
GRADING RUBRIC - Chat App

1 STAR: Basic text input and message list. Messages just appear as plain text. No user distinction.

2 STARS: Message bubbles with sender name. Different styling for sent vs received. Input with send button. Timestamp on messages. Basic chat layout.

3 STARS: Multiple chat rooms/channels with sidebar. Auto-scroll to newest message. Online user list. Message timestamps formatted nicely. Responsive layout. Empty state handling.

4 STARS: Typing indicators. Read receipts. Message reactions (emoji). File/image attachment preview. User avatars. Search messages. Message editing/deletion. Notification badges on channels.

5 STARS: Framer Motion message entrance animations (slide in, fade). Smooth channel switching transitions. Animated typing indicator dots. GIF/sticker picker with animated preview. Dark mode with smooth toggle. Keyboard shortcuts. Animated emoji reactions.

6 STARS: All of 5-star PLUS: Message threads/replies with animated expansion. Rich text formatting (markdown, code blocks with syntax highlighting). Voice message waveform visualization. Pinned messages. User presence with animated status dots. Pixel-perfect Slack/Discord-quality design. Buttery smooth scroll with virtual list.
"#;

const KANBAN_BOARD_RUBRIC: &str = r#"
GRADING RUBRIC - Kanban Board

1 STAR: Static columns with text items. No drag and drop. No interactivity.

2 STARS: Named columns (To Do, In Progress, Done) with cards. Add card button. Delete card. Basic styling with column colors.

3 STARS: Drag and drop between columns (using react-beautiful-dnd or similar). Card detail modal (title, description). Add/rename/delete columns. Card count per column. Responsive layout.

4 STARS: Card labels/tags with colors. Due dates on cards. Assignee avatars. Card priority indicators. Search/filter cards. Swimlanes. Column card limits (WIP limits). Local storage persistence.

5 STARS: Framer Motion drag animations (smooth card movement, column reorder). Animated card creation/deletion. Board background customization. Calendar view. Activity log/history. Keyboard navigation. Time tracking on cards.

6 STARS: All of 5-star PLUS: Buttery 60fps drag with spring physics and placeholder animations. Card dependency arrows (Gantt-style). Burndown chart. Multiple board views (list, timeline, calendar). Custom fields on cards. Automations (when moved to Done, mark complete). Professional Trello/Jira-quality experience.
"#;

const ECOMMERCE_STORE_RUBRIC: &str = r#"
GRADING RUBRIC - E-commerce Store

1 STAR: List of product names and prices. No images, no cart, no interactivity.

2 STARS: Product cards with images, names, prices. Add to cart button. Cart page showing items and total. Basic grid layout.

3 STARS: Product detail page. Category filtering. Cart with quantity adjustment. Checkout form (name, address, payment fields — mock). Responsive grid. Empty cart state. Product image gallery.

4 STARS: Search with autocomplete. Wishlist. Product reviews/ratings display. Size/variant selector. Cart badge in header. Order summary. Breadcrumb navigation. Sort by (price, rating, newest).

5 STARS: Framer Motion page transitions and product card hover animations. Animated cart drawer (slide in). Image zoom on hover. Skeleton loading states with shimmer. Dark mode. Smooth filter animations. Add-to-cart celebration animation.

6 STARS: All of 5-star PLUS: Advanced product image viewer (pinch zoom, 360 spin). Animated checkout stepper with progress. Real-time stock indicators. Recently viewed carousel. Product comparison. Augmented reality preview concept. Looks like a premium Shopify theme — polished to perfection.
"#;

const AI_IMAGE_GENERATOR_RUBRIC: &str = r#"
GRADING RUBRIC - AI Image Generator

1 STAR: Text input and a static placeholder image. No real generation or gallery.

2 STARS: Prompt input with generate button. Display area for generated image (can be placeholder/mock). Basic styling. Loading state during "generation."

3 STARS: Image gallery showing history of generated images. Style presets dropdown (photorealistic, anime, oil painting, etc). Image dimensions selector. Download button. Responsive masonry grid for gallery. Generation progress indicator.

4 STARS: Negative prompt input. Seed control for reproducibility. Image-to-image (upload reference). Batch generation. Comparison view (before/after or side-by-side). Favorite/bookmark images. Advanced settings panel (steps, CFG scale).

5 STARS: Framer Motion animated gallery (stagger load, hover scale). Smooth panel transitions. Animated progress bar during generation. Image lightbox with gesture navigation. Prompt history with animated dropdown. Dark mode. Canvas inpainting interface.

6 STARS: All of 5-star PLUS: Interactive canvas with brush tools for inpainting/outpainting. Real-time preview as settings change. Prompt builder with tag suggestions and autocomplete. Community gallery concept. Image variation generation. Side-by-side model comparison. Stunning, Midjourney-web-quality interface.
"#;

const API_DASHBOARD_RUBRIC: &str = r#"
GRADING RUBRIC - API Dashboard

1 STAR: Plain text list of endpoint names. No metrics, no interactivity.

2 STARS: Endpoint list with status codes and response times. Basic table layout. Status indicator (up/down) per endpoint. Styled with monospace font.

3 STARS: Request/response log with timestamps. Charts showing response time over time (line or bar chart). Endpoint grouping by category. Status summary cards (total requests, avg response time, error rate). Responsive layout.

4 STARS: Real-time updating metrics (simulated). Detailed request inspector (headers, body, response). Filtering by status code, endpoint, time range. Rate limiting indicators. Latency percentiles (p50, p95, p99). Export logs. Alert thresholds.

5 STARS: Framer Motion chart animations (data point transitions, bar growth). Animated status transitions. Smooth tab/panel switching. Interactive tooltip on chart hover. Dark mode with neon accents. Live-updating numbers with count-up animation. Keyboard shortcuts for navigation.

6 STARS: All of 5-star PLUS: Real-time WebSocket-style feed with animated log entries. Dependency graph visualization (service map). Anomaly detection highlighting. Custom dashboard builder (drag widgets). Distributed tracing waterfall view. Looks like Datadog/Grafana quality — professional monitoring tool.
"#;

const BLOCKCHAIN_RUBRIC: &str = r#"
GRADING RUBRIC - Blockchain Explorer

1 STAR: Plain text list of block numbers. No transaction data, no interactivity.

2 STARS: Block list with hash, timestamp, transaction count. Click to view block details. Basic table layout with monospace styling.

3 STARS: Transaction list within blocks. Address lookup. Block chain visualization (linked blocks). Search by block number, hash, or address. Pagination. Responsive layout. Loading states.

4 STARS: Transaction detail view (from, to, value, gas). Address balance and transaction history. Network stats dashboard (total blocks, transactions, gas price). Real-time new block notifications. Hash truncation with copy-to-clipboard. Block time chart.

5 STARS: Framer Motion animated block chain visualization (new blocks slide in). Animated transaction flow diagrams. Smooth page transitions. Interactive network graph. Real-time counter animations. Dark mode with crypto aesthetic (neon/matrix). Chart animations.

6 STARS: All of 5-star PLUS: 3D block chain visualization with WebGL/Three.js. Live transaction mempool visualization. Token transfer tracking with animated flow paths. Smart contract interaction interface. Gas price oracle with animated chart. Rich address analytics. Etherscan-quality professional blockchain explorer.
"#;

const DEFAULT_RUBRIC: &str = r#"
GRADING RUBRIC - General Web Application

1 STAR: Bare minimum functionality. Basic HTML with no styling. Broken or missing features.

2 STARS: Core functionality works. Basic CSS styling. Reasonable layout.

3 STARS: Clean component structure. Good state management. Responsive design. Error handling. Loading states.

4 STARS: Advanced features beyond the basics. Good UX polish. Persistence. Search/filter. Professional styling.

5 STARS: Animations (framer-motion). Dark mode. Keyboard shortcuts. Multiple views/modes. Excellent UX.

6 STARS: Production-grade. Stunning micro-interactions. Accessibility. Performance optimized. Award-worthy design.
"#;
```

**Step 2: Commit**

```bash
git add server/src/grading/rubrics.rs
git commit -m "feat: add per-app-type grading rubrics for LLM evaluation"
```

---

### Task 4: Create grading service module

**Files:**
- Create: `server/src/grading/mod.rs`
- Modify: `server/src/lib.rs`

**Step 1: Create `server/src/grading/mod.rs`**

```rust
pub mod rubrics;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tracing::{info, warn};

// ── Grade data ────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct BuildingGrade {
    pub stars: u8,
    pub reasoning: String,
    pub graded_at: u64,
    pub grading: bool,
}

// ── Grading Service ───────────────────────────────────────────────────

pub struct GradingService {
    api_key: Option<String>,
    pub grades: HashMap<String, BuildingGrade>,
}

impl GradingService {
    pub fn new() -> Self {
        Self {
            api_key: std::env::var("ANTHROPIC_API_KEY").ok(),
            grades: HashMap::new(),
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        info!("[grading] Anthropic API key set");
        self.api_key = Some(key);
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn mark_grading(&mut self, building_id: &str) {
        if let Some(grade) = self.grades.get_mut(building_id) {
            grade.grading = true;
        } else {
            self.grades.insert(building_id.to_string(), BuildingGrade {
                stars: 0,
                reasoning: String::new(),
                graded_at: 0,
                grading: true,
            });
        }
    }

    pub fn set_grade(&mut self, building_id: &str, stars: u8, reasoning: String, tick: u64) {
        self.grades.insert(building_id.to_string(), BuildingGrade {
            stars,
            reasoning,
            graded_at: tick,
            grading: false,
        });
    }

    /// Get the income multiplier for a building based on its grade.
    /// Ungraded buildings return 1.0 (base income).
    pub fn get_multiplier(&self, building_id: &str) -> f64 {
        match self.grades.get(building_id) {
            None => 1.0, // ungraded = base income
            Some(grade) => match grade.stars {
                0 => 0.0,
                1 => 0.5,
                2 => 1.0,
                3 => 2.0,
                4 => 3.0,
                5 => 5.0,
                6 => 10.0,
                _ => 1.0,
            },
        }
    }
}

// ── File reading ──────────────────────────────────────────────────────

/// Read all source files from a project directory, returning (relative_path, contents) pairs.
/// Ignores node_modules, dist, .git, package-lock.json, and binary files.
pub fn read_project_sources(project_dir: &Path) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    collect_source_files(project_dir, project_dir, &mut files)?;
    // Sort by path for deterministic ordering
    files.sort_by(|a, b| a.0.cmp(&b.0));
    // Limit total size to ~100KB to stay within token limits
    let mut total_size = 0usize;
    let mut truncated = Vec::new();
    for (path, content) in files {
        total_size += content.len();
        if total_size > 100_000 {
            truncated.push((path, "[truncated — file too large to include]".to_string()));
            break;
        }
        truncated.push((path, content));
    }
    Ok(truncated)
}

fn collect_source_files(
    base: &Path,
    dir: &Path,
    files: &mut Vec<(String, String)>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip ignored directories
        if path.is_dir() {
            if matches!(name.as_str(), "node_modules" | "dist" | ".git" | ".next" | "build" | "coverage" | ".turbo") {
                continue;
            }
            collect_source_files(base, &path, files)?;
            continue;
        }

        // Only include known source file extensions
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !matches!(ext, "ts" | "tsx" | "js" | "jsx" | "css" | "html" | "json" | "svg") {
            continue;
        }

        // Skip lock files and large config files
        if matches!(name.as_str(), "package-lock.json" | "yarn.lock" | "pnpm-lock.yaml") {
            continue;
        }

        // Read file contents
        match std::fs::read_to_string(&path) {
            Ok(content) => {
                let rel_path = path.strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();
                files.push((rel_path, content));
            }
            Err(_) => {
                // Skip files that can't be read (binary, permissions, etc)
            }
        }
    }
    Ok(())
}

// ── Claude API call ───────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
struct ClaudeResponse {
    content: Vec<ContentBlock>,
}

#[derive(Debug, serde::Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

/// Grade a building's source code using the Claude API.
/// Returns (stars, reasoning) on success.
pub async fn grade_with_claude(
    api_key: &str,
    building_id: &str,
    building_name: &str,
    building_description: &str,
    sources: &[(String, String)],
) -> Result<(u8, String), String> {
    let rubric = rubrics::get_rubric(building_id);

    // Build the source code section
    let mut source_section = String::new();
    for (path, content) in sources {
        source_section.push_str(&format!("\n--- {} ---\n{}\n", path, content));
    }

    let prompt = format!(
        r#"You are a code quality grader for a game. You are evaluating a "{building_name}" app.

App description: {building_description}

{rubric}

Here is the complete source code of the app:

{source_section}

IMPORTANT INSTRUCTIONS:
- Grade the app on a scale of 0-6 stars based on the rubric above.
- 0 stars means the code has syntax errors, broken imports, or is fundamentally non-functional.
- Be strict but fair. A 6-star rating should be truly exceptional.
- Most apps will be 1-4 stars. 5-6 is reserved for genuinely impressive work.

Respond with ONLY a JSON object in this exact format (no markdown, no code fences):
{{"stars": <number 0-6>, "reasoning": "<2-3 sentence explanation of the grade>"}}"#
    );

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&serde_json::json!({
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 300,
            "messages": [{
                "role": "user",
                "content": prompt
            }]
        }))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Claude API error {}: {}", status, body));
    }

    let claude_response: ClaudeResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    let text = claude_response
        .content
        .first()
        .and_then(|b| b.text.as_ref())
        .ok_or_else(|| "Empty response from Claude".to_string())?;

    // Parse the JSON response
    #[derive(serde::Deserialize)]
    struct GradeResponse {
        stars: u8,
        reasoning: String,
    }

    let grade: GradeResponse = serde_json::from_str(text.trim())
        .map_err(|e| format!("Failed to parse grade JSON '{}': {}", text.trim(), e))?;

    // Clamp stars to 0-6
    let stars = grade.stars.min(6);

    info!("[grading] {} graded: {} stars", building_id, stars);
    Ok((stars, grade.reasoning))
}
```

**Step 2: Register the module in `server/src/lib.rs`**

Add `pub mod grading;` to `server/src/lib.rs`:

```rust
pub mod ai;
pub mod ecs;
pub mod game;
pub mod grading;  // NEW
pub mod network;
pub mod project;
pub mod protocol;
pub mod vibe;
```

**Step 3: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles successfully

**Step 4: Commit**

```bash
git add server/src/grading/ server/src/lib.rs
git commit -m "feat: add grading service with Claude API integration and file reading"
```

---

### Task 5: Wire grading into server main loop

**Files:**
- Modify: `server/src/main.rs`

**Step 1: Add grading service import and initialization**

At the top of `server/src/main.rs`, add:
```rust
use its_time_to_build_server::grading;
```

After `let mut vibe_manager = VibeManager::new();` (around line 70), add:
```rust
let mut grading_service = grading::GradingService::new();
```

**Step 2: Handle GradeBuilding action**

In the `PlayerAction` match block (around line 517, after the `SetMistralApiKey` handler), add:

```rust
PlayerAction::SetAnthropicApiKey { key } => {
    grading_service.set_api_key(key.clone());
    debug_log_entries.push("[grading] Anthropic API key set".to_string());
}
PlayerAction::GradeBuilding { building_id } => {
    if !grading_service.has_api_key() {
        debug_log_entries.push("[grading] No Anthropic API key set".to_string());
    } else if grading_service.grades.get(building_id.as_str()).map_or(false, |g| g.grading) {
        debug_log_entries.push(format!("[grading] {} already being graded", building_id));
    } else {
        // Read source files
        let base = project_manager.base_dir.as_ref();
        let building = project_manager.manifest.get_building(building_id);
        if let (Some(base), Some(building)) = (base, building) {
            let project_dir = base.join(&building.directory_name);
            match grading::read_project_sources(&project_dir) {
                Ok(sources) if sources.is_empty() => {
                    debug_log_entries.push(format!("[grading] no source files found for {}", building_id));
                }
                Ok(sources) => {
                    grading_service.mark_grading(building_id);
                    let api_key = grading_service.api_key.as_ref().unwrap().clone();
                    let bid = building_id.clone();
                    let bname = building.name.clone();
                    let bdesc = building.description.clone();
                    let tick = game_state.tick;

                    // Spawn async grading task
                    let grade_tx = grade_result_tx.clone();
                    tokio::spawn(async move {
                        let result = grading::grade_with_claude(
                            &api_key, &bid, &bname, &bdesc, &sources,
                        ).await;
                        let _ = grade_tx.send((bid, tick, result));
                    });

                    debug_log_entries.push(format!("[grading] grading {} ...", building_id));
                }
                Err(e) => {
                    debug_log_entries.push(format!("[grading] failed to read sources: {}", e));
                }
            }
        } else {
            debug_log_entries.push(format!("[grading] building {} not found or no base dir", building_id));
        }
    }
}
```

**Step 3: Add async grade result channel**

Before the main game loop (`loop {`), add:

```rust
// Channel for receiving grade results from async tasks
let (grade_result_tx, mut grade_result_rx) =
    tokio::sync::mpsc::unbounded_channel::<(String, u64, Result<(u8, String), String>)>();
```

**Step 4: Poll grade results in the game loop**

After the vibe session polling section (around line 827, after `}` for "Poll for finished sessions"), add:

```rust
// Poll for completed grading results
while let Ok((building_id, tick, result)) = grade_result_rx.try_recv() {
    match result {
        Ok((stars, reasoning)) => {
            grading_service.set_grade(&building_id, stars, reasoning.clone(), tick);
            debug_log_entries.push(format!(
                "[grading] {} rated {} star{}",
                building_id,
                stars,
                if stars == 1 { "" } else { "s" }
            ));
            server.send_message(&ServerMessage::GradeResult {
                building_id,
                stars,
                reasoning,
            });
        }
        Err(e) => {
            // Clear grading flag on failure
            if let Some(grade) = grading_service.grades.get_mut(&building_id) {
                grade.grading = false;
            }
            debug_log_entries.push(format!("[grading] {} failed: {}", building_id, e));
        }
    }
}
```

**Step 5: Add building_grades to ProjectManagerState serialization**

In the `GameStateUpdate` construction (around line 1102), modify the `project_manager` field. After `agent_assignments: project_manager.agent_assignments.clone(),` add:

```rust
building_grades: grading_service.grades.iter().map(|(k, v)| {
    (k.clone(), crate::protocol::BuildingGradeState {
        stars: v.stars,
        reasoning: v.reasoning.clone(),
        grading: v.grading,
    })
}).collect(),
```

**Step 6: Pass grading multipliers to economy system**

The economy system needs grade multipliers. Change the economy system call:

From:
```rust
economy::economy_system(&world, &mut game_state);
```

To:
```rust
economy::economy_system(&world, &mut game_state, &grading_service);
```

(We'll update the economy system signature in the next task.)

**Step 7: Verify compilation**

Run: `cd server && cargo check`
Expected: Will fail until Task 6 updates economy system — that's expected.

**Step 8: Commit**

```bash
git add server/src/main.rs
git commit -m "feat: wire grading service into server main loop with async Claude API calls"
```

---

### Task 6: Update economy system with grade multipliers

**Files:**
- Modify: `server/src/ecs/systems/economy.rs`

**Step 1: Update economy_system signature and apply multipliers**

Replace the entire `economy.rs` file with:

```rust
use hecs::World;

use crate::ecs::components::{
    Agent, AgentState, AgentTier, Building, BuildingType, ConstructionProgress, GameState,
};
use crate::grading::GradingService;
use crate::project::ProjectManager;
use crate::protocol::{AgentStateKind, AgentTierKind, BuildingTypeKind};

/// Runs the economy system for a single tick.
///
/// Calculates total agent wages (expenditure) and building passive income,
/// then updates `game_state.economy` with the computed values and applies
/// the net change to the balance.
pub fn economy_system(world: &World, game_state: &mut GameState, grading_service: &GradingService) {
    let mut total_wages: f64 = 0.0;
    let mut wage_sinks: Vec<(String, f64)> = Vec::new();

    // ── Agent wages (expenditure) ────────────────────────────────────
    for (_entity, (_agent, agent_state, agent_tier)) in
        world.query::<(&Agent, &AgentState, &AgentTier)>().iter()
    {
        // Dead and dormant agents cost nothing.
        if agent_state.state == AgentStateKind::Unresponsive
            || agent_state.state == AgentStateKind::Dormant
        {
            continue;
        }

        let base_wage = match agent_tier.tier {
            AgentTierKind::Apprentice => 0.05,
            AgentTierKind::Journeyman => 0.1,
            AgentTierKind::Artisan => 0.2,
            AgentTierKind::Architect => 0.4,
        };

        // Idle agents cost half.
        let wage = if agent_state.state == AgentStateKind::Idle {
            base_wage * 0.5
        } else {
            base_wage
        };

        total_wages += wage;
        wage_sinks.push((format!("{:?}", agent_tier.tier), wage));
    }

    // ── Building passive income ──────────────────────────────────────
    let mut total_income: f64 = 0.0;
    let mut income_sources: Vec<(String, f64)> = Vec::new();

    for (_entity, (_building, building_type, progress)) in world
        .query::<(&Building, &BuildingType, &ConstructionProgress)>()
        .iter()
    {
        // Only completed buildings generate income.
        if progress.current < progress.total {
            continue;
        }

        let base_income = match building_type.kind {
            BuildingTypeKind::ComputeFarm => 0.5,
            BuildingTypeKind::TodoApp => 0.02,
            BuildingTypeKind::WeatherDashboard => 0.1,
            BuildingTypeKind::EcommerceStore => 0.3,
            BuildingTypeKind::AiImageGenerator => 0.25,
            BuildingTypeKind::Blockchain => 1.0,
            _ => 0.0,
        };

        if base_income > 0.0 {
            // Look up grade multiplier for app buildings
            let type_name = format!("{:?}", building_type.kind);
            let building_id = ProjectManager::building_type_to_id(&type_name);
            let multiplier = building_id
                .as_deref()
                .map(|id| grading_service.get_multiplier(id))
                .unwrap_or(1.0);

            let income = base_income * multiplier;
            total_income += income;

            let label = if multiplier != 1.0 {
                format!("{:?} ({}x)", building_type.kind, multiplier)
            } else {
                format!("{:?}", building_type.kind)
            };
            income_sources.push((label, income));
        }
    }

    // ── Update economy state ─────────────────────────────────────────
    game_state.economy.income_per_tick = total_income;
    game_state.economy.expenditure_per_tick = total_wages;
    game_state.economy.income_sources = income_sources;
    game_state.economy.expenditure_sinks = wage_sinks;

    // Apply net change to balance.
    let net = total_income - total_wages;
    game_state.economy.balance += net as i64;
}
```

**Step 2: Verify compilation**

Run: `cd server && cargo check`
Expected: Compiles successfully

**Step 3: Commit**

```bash
git add server/src/ecs/systems/economy.rs
git commit -m "feat: apply grade multipliers to building income in economy system"
```

---

### Task 7: Add Grade button and star display to BuildingPanel

**Files:**
- Modify: `client/src/ui/building-panel.ts`

**Step 1: Add grade-related elements and state**

Add new private fields after `private loadedIframeSrc`:

```typescript
private readonly gradeBtn: HTMLButtonElement;
private readonly gradeRow: HTMLDivElement;
private readonly starsEl: HTMLDivElement;
private readonly reasoningEl: HTMLParagraphElement;

private currentGrade: { stars: number; reasoning: string; grading: boolean } | null = null;
```

**Step 2: Build the grade UI elements in the constructor**

After the `this.descriptionEl` setup and before the iframe setup, add:

```typescript
// ── Grade row ──────────────────────────────────────────────
this.gradeRow = document.createElement('div');
Object.assign(this.gradeRow.style, {
  display: 'none',
  padding: '8px 16px',
  borderBottom: `1px solid ${COLORS.headerBorder}`,
  flexShrink: '0',
});

this.starsEl = document.createElement('div');
Object.assign(this.starsEl.style, {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '4px',
});

this.reasoningEl = document.createElement('p');
Object.assign(this.reasoningEl.style, {
  margin: '0',
  fontSize: '11px',
  fontFamily: FONT,
  color: COLORS.mutedGold,
  opacity: '0.7',
  lineHeight: '1.4',
});

this.gradeRow.appendChild(this.starsEl);
this.gradeRow.appendChild(this.reasoningEl);
```

**Step 3: Add Grade button to header**

After `this.toggleBtn` setup (around where `this.toggleBtn.addEventListener` is), add:

```typescript
// Grade button
this.gradeBtn = document.createElement('button');
this.applyButtonStyle(this.gradeBtn, false);
this.gradeBtn.textContent = 'Grade';
this.gradeBtn.addEventListener('click', () => this.handleGrade());
```

In the header assembly, insert `this.gradeBtn` between `this.toggleBtn` and `this.closeBtn`:

```typescript
header.appendChild(this.titleEl);
header.appendChild(this.statusBadge);
header.appendChild(this.toggleBtn);
header.appendChild(this.gradeBtn);    // NEW
header.appendChild(this.closeBtn);
```

**Step 4: Add grade row to the container assembly**

Between `this.container.appendChild(this.descriptionEl);` and `this.container.appendChild(this.iframe);`, add:

```typescript
this.container.appendChild(this.gradeRow);
```

**Step 5: Add grade rendering methods**

Add after the `applyButtonStyle` method:

```typescript
private handleGrade(): void {
  if (!this.currentBuildingId) return;
  this.callbacks.onAction({ GradeBuilding: { building_id: this.currentBuildingId } });
  // Show loading state immediately
  this.gradeBtn.textContent = 'Grading...';
  this.gradeBtn.disabled = true;
  this.gradeBtn.style.opacity = '0.5';
  this.gradeBtn.style.cursor = 'wait';
}

/** Update the grade display from server state. */
updateGrade(grade: { stars: number; reasoning: string; grading: boolean } | null): void {
  this.currentGrade = grade;

  if (!grade) {
    this.gradeRow.style.display = 'none';
    this.gradeBtn.textContent = 'Grade';
    this.gradeBtn.disabled = false;
    this.gradeBtn.style.opacity = '1';
    this.gradeBtn.style.cursor = 'pointer';
    return;
  }

  if (grade.grading) {
    this.gradeBtn.textContent = 'Grading...';
    this.gradeBtn.disabled = true;
    this.gradeBtn.style.opacity = '0.5';
    this.gradeBtn.style.cursor = 'wait';
    return;
  }

  // Show grade result
  this.gradeBtn.textContent = 'Re-Grade';
  this.gradeBtn.disabled = false;
  this.gradeBtn.style.opacity = '1';
  this.gradeBtn.style.cursor = 'pointer';

  this.gradeRow.style.display = 'block';
  this.renderStars(grade.stars);
  this.reasoningEl.textContent = grade.reasoning;
}

private renderStars(count: number): void {
  this.starsEl.innerHTML = '';

  // Multiplier label
  const multipliers: Record<number, string> = {
    0: '0x', 1: '0.5x', 2: '1x', 3: '2x', 4: '3x', 5: '5x', 6: '10x',
  };

  for (let i = 1; i <= 6; i++) {
    const star = document.createElement('span');
    star.textContent = i <= count ? '\u2605' : '\u2606';
    star.style.fontSize = '16px';
    star.style.color = i <= count ? COLORS.gold : '#444444';
    this.starsEl.appendChild(star);
  }

  const mult = document.createElement('span');
  mult.textContent = ` (${multipliers[count] ?? '1x'} income)`;
  mult.style.fontSize = '11px';
  mult.style.color = count >= 5 ? COLORS.gold : COLORS.mutedGold;
  mult.style.marginLeft = '8px';
  this.starsEl.appendChild(mult);
}
```

**Step 6: Verify the client builds**

Run: `cd client && npx tsc --noEmit`
Expected: Compiles (may have pre-existing warnings, but no new errors)

**Step 7: Commit**

```bash
git add client/src/ui/building-panel.ts
git commit -m "feat: add Grade button and star rating display to building panel"
```

---

### Task 8: Add star display to BuildingToolbar

**Files:**
- Modify: `client/src/ui/building-toolbar.ts`

**Step 1: Add stars element**

Add a new private field:
```typescript
private starsEl: HTMLSpanElement;
```

**Step 2: Create stars element in constructor**

After the `this.statusEl` setup, add:
```typescript
this.starsEl = document.createElement('span');
this.starsEl.style.cssText = 'font-size: 10px; color: #d4a017; display: none;';
```

Add it to the header after `this.statusEl`:
```typescript
header.appendChild(this.nameEl);
header.appendChild(this.statusEl);
header.appendChild(this.starsEl);
```

**Step 3: Add updateGrade method**

```typescript
updateStars(stars: number | null): void {
  if (stars === null || stars === undefined) {
    this.starsEl.style.display = 'none';
    return;
  }
  this.starsEl.style.display = 'inline';
  let text = '';
  for (let i = 1; i <= 6; i++) {
    text += i <= stars ? '\u2605' : '\u2606';
  }
  this.starsEl.textContent = text;
}
```

**Step 4: Commit**

```bash
git add client/src/ui/building-toolbar.ts
git commit -m "feat: show star rating in building toolbar hover popup"
```

---

### Task 9: Wire grading into client main.tsx

**Files:**
- Modify: `client/src/main.tsx`
- Modify: `client/src/network/connection.ts`

**Step 1: Add GradeResult handler to Connection**

In `client/src/network/connection.ts`, add a callback field:
```typescript
private gradeResultCallback: ((buildingId: string, stars: number, reasoning: string) => void) | null = null;
```

Add handler in the message processing (after the `VibeSessionEnded` block):
```typescript
} else if ('GradeResult' in msg) {
  if (this.gradeResultCallback) {
    this.gradeResultCallback(
      msg.GradeResult.building_id,
      msg.GradeResult.stars,
      msg.GradeResult.reasoning,
    );
  }
}
```

Add public registration method:
```typescript
onGradeResult(callback: (buildingId: string, stars: number, reasoning: string) => void): void {
  this.gradeResultCallback = callback;
}
```

**Step 2: Wire grade data in main.tsx game loop**

In the `onState` callback in `client/src/main.tsx`, find where the building panel is updated with status. After the building panel `updateStatus` call, add grade updating.

Search for where `buildingPanel.updateStatus(statusStr)` is called and add after it:
```typescript
// Update grade display
const grades = state.project_manager?.building_grades;
if (grades && buildingPanel.currentBuildingId) {
  const grade = grades[buildingPanel.currentBuildingId];
  buildingPanel.updateGrade(grade ?? null);
}
```

Similarly, in the building toolbar `show()` call, add stars. Find where `buildingToolbar.show(...)` is called and after it, add:
```typescript
// Update star display on toolbar
const toolbarGrades = state.project_manager?.building_grades;
if (toolbarGrades) {
  const toolbarGrade = toolbarGrades[buildingToolbar.currentBuildingId];
  buildingToolbar.updateStars(toolbarGrade?.stars ?? null);
}
```

**Step 3: Commit**

```bash
git add client/src/main.tsx client/src/network/connection.ts
git commit -m "feat: wire grading results into client UI updates"
```

---

### Task 10: Full integration test

**Step 1: Verify server compiles and runs**

Run: `cd server && cargo build`
Expected: Build succeeds

**Step 2: Verify client compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No type errors

**Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve any remaining compilation issues for grading system"
```

---

### Summary of all changes

| File | Change |
|------|--------|
| `server/Cargo.toml` | Add `reqwest` dependency |
| `server/src/protocol.rs` | Add `BuildingGradeState`, `GradeBuilding`, `SetAnthropicApiKey`, `GradeResult` |
| `server/src/lib.rs` | Register `grading` module |
| `server/src/grading/mod.rs` | New: GradingService, file reader, Claude API caller |
| `server/src/grading/rubrics.rs` | New: Per-app-type grading rubrics |
| `server/src/main.rs` | Wire grading service, handle actions, poll results |
| `server/src/ecs/systems/economy.rs` | Apply grade multipliers to building income |
| `client/src/network/protocol.ts` | Add TS types for grades |
| `client/src/network/connection.ts` | Handle GradeResult messages |
| `client/src/ui/building-panel.ts` | Grade button, star display, reasoning |
| `client/src/ui/building-toolbar.ts` | Star rating display |
| `client/src/main.tsx` | Wire grade data to UI components |
