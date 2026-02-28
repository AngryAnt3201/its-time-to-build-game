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
