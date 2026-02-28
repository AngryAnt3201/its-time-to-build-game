import type { BuildingTypeKind } from '../network/protocol';

// ── Building definition ──────────────────────────────────────────────

export interface BuildingDef {
  type: BuildingTypeKind;
  name: string;
  cost: number;
  description: string;
  tier: number;
  port: number;
  directoryName: string;
}

// ── Tier display names ───────────────────────────────────────────────

export const TIER_NAMES: Record<number, string> = {
  0: 'INFRASTRUCTURE',
  1: 'TIER 1 — HUT ERA',
  2: 'TIER 2 — OUTPOST ERA',
  3: 'TIER 3 — VILLAGE ERA',
  4: 'TIER 4 — NETWORK ERA',
};

// ── All building definitions ─────────────────────────────────────────

export const ALL_BUILDINGS: BuildingDef[] = [
  // ── Infrastructure (tier 0) ──────────────────────────────────────
  {
    type: 'Pylon',
    name: 'Pylon',
    cost: 30,
    description: 'Illuminates surrounding area',
    tier: 0,
    port: 0,
    directoryName: '',
  },
  {
    type: 'ComputeFarm',
    name: 'Compute Farm',
    cost: 80,
    description: 'Passive token generation',
    tier: 0,
    port: 0,
    directoryName: '',
  },

  // ── Tier 1 — Hut Era (ports 3101–3107) ───────────────────────────
  {
    type: 'TodoApp',
    name: 'Todo App',
    cost: 50,
    description: 'Classic todo list with add/complete/delete',
    tier: 1,
    port: 3101,
    directoryName: 'todo-app',
  },
  {
    type: 'Calculator',
    name: 'Calculator',
    cost: 60,
    description: 'Calculator with basic operations',
    tier: 1,
    port: 3102,
    directoryName: 'calculator',
  },
  {
    type: 'LandingPage',
    name: 'Landing Page',
    cost: 40,
    description: 'Single-page marketing site',
    tier: 1,
    port: 3103,
    directoryName: 'landing-page',
  },
  {
    type: 'PortfolioSite',
    name: 'Portfolio Site',
    cost: 70,
    description: 'Personal portfolio with project cards',
    tier: 1,
    port: 3104,
    directoryName: 'portfolio-site',
  },
  {
    type: 'PomodoroTimer',
    name: 'Pomodoro Timer',
    cost: 55,
    description: 'Timer with work/break intervals',
    tier: 1,
    port: 3105,
    directoryName: 'pomodoro-timer',
  },
  {
    type: 'WeatherApp',
    name: 'Weather App',
    cost: 65,
    description: 'Weather dashboard with mock data',
    tier: 1,
    port: 3106,
    directoryName: 'weather-app',
  },
  {
    type: 'ColourPickerTool',
    name: 'Colour Picker Tool',
    cost: 45,
    description: 'Color picker with hex/rgb output',
    tier: 1,
    port: 3107,
    directoryName: 'colour-picker-tool',
  },

  // ── Tier 2 — Outpost Era (ports 3111–3118) ───────────────────────
  {
    type: 'RestApi',
    name: 'REST API',
    cost: 150,
    description: 'API docs viewer and endpoint tester',
    tier: 2,
    port: 3111,
    directoryName: 'rest-api',
  },
  {
    type: 'AuthenticationSystem',
    name: 'Authentication System',
    cost: 180,
    description: 'Login and register with mock auth',
    tier: 2,
    port: 3112,
    directoryName: 'authentication-system',
  },
  {
    type: 'Database',
    name: 'Database',
    cost: 200,
    description: 'Data table browser and editor',
    tier: 2,
    port: 3113,
    directoryName: 'database',
  },
  {
    type: 'AdminDashboard',
    name: 'Admin Dashboard',
    cost: 170,
    description: 'Dashboard with charts and stats',
    tier: 2,
    port: 3114,
    directoryName: 'admin-dashboard',
  },
  {
    type: 'SearchBar',
    name: 'Search Bar',
    cost: 130,
    description: 'Search interface with filters',
    tier: 2,
    port: 3115,
    directoryName: 'search-bar',
  },
  {
    type: 'FormWithValidation',
    name: 'Form With Validation',
    cost: 140,
    description: 'Multi-step form with validation',
    tier: 2,
    port: 3116,
    directoryName: 'form-with-validation',
  },
  {
    type: 'MarkdownEditor',
    name: 'Markdown Editor',
    cost: 160,
    description: 'Split-pane editor with preview',
    tier: 2,
    port: 3117,
    directoryName: 'markdown-editor',
  },
  {
    type: 'BudgetTracker',
    name: 'Budget Tracker',
    cost: 155,
    description: 'Income/expense tracker with charts',
    tier: 2,
    port: 3118,
    directoryName: 'budget-tracker',
  },

  // ── Tier 3 — Village Era (ports 3121–3129) ────────────────────────
  {
    type: 'CiCdPipeline',
    name: 'CI/CD Pipeline',
    cost: 300,
    description: 'Pipeline stage visualizer',
    tier: 3,
    port: 3121,
    directoryName: 'ci-cd-pipeline',
  },
  {
    type: 'UnitTestSuite',
    name: 'Unit Test Suite',
    cost: 280,
    description: 'Test runner results dashboard',
    tier: 3,
    port: 3122,
    directoryName: 'unit-test-suite',
  },
  {
    type: 'CliTool',
    name: 'CLI Tool',
    cost: 320,
    description: 'Web-based terminal emulator',
    tier: 3,
    port: 3123,
    directoryName: 'cli-tool',
  },
  {
    type: 'BrowserExtension',
    name: 'Browser Extension',
    cost: 260,
    description: 'Extension options page',
    tier: 3,
    port: 3124,
    directoryName: 'browser-extension',
  },
  {
    type: 'RecommendationEngine',
    name: 'Recommendation Engine',
    cost: 350,
    description: 'Content feed with recommendations',
    tier: 3,
    port: 3125,
    directoryName: 'recommendation-engine',
  },
  {
    type: 'NotificationSystem',
    name: 'Notification System',
    cost: 270,
    description: 'Notification center and inbox',
    tier: 3,
    port: 3126,
    directoryName: 'notification-system',
  },
  {
    type: 'RateLimiter',
    name: 'Rate Limiter',
    cost: 290,
    description: 'Rate limit config and traffic viz',
    tier: 3,
    port: 3127,
    directoryName: 'rate-limiter',
  },
  {
    type: 'OauthIntegration',
    name: 'OAuth Integration',
    cost: 310,
    description: 'OAuth flow demo with providers',
    tier: 3,
    port: 3128,
    directoryName: 'oauth-integration',
  },
  {
    type: 'WebsocketServer',
    name: 'WebSocket Server',
    cost: 340,
    description: 'Real-time chat application',
    tier: 3,
    port: 3129,
    directoryName: 'websocket-server',
  },

  // ── Tier 4 — Network Era (ports 3131–3136) ────────────────────────
  {
    type: 'MachineLearningModel',
    name: 'Machine Learning Model',
    cost: 500,
    description: 'ML prediction playground',
    tier: 4,
    port: 3131,
    directoryName: 'machine-learning-model',
  },
  {
    type: 'VectorDatabase',
    name: 'Vector Database',
    cost: 480,
    description: 'Similarity search interface',
    tier: 4,
    port: 3132,
    directoryName: 'vector-database',
  },
  {
    type: 'GraphqlApi',
    name: 'GraphQL API',
    cost: 450,
    description: 'GraphQL query playground',
    tier: 4,
    port: 3133,
    directoryName: 'graphql-api',
  },
  {
    type: 'TransformerModel',
    name: 'Transformer Model',
    cost: 800,
    description: 'Text generation interface',
    tier: 4,
    port: 3134,
    directoryName: 'transformer-model',
  },
  {
    type: 'RagPipeline',
    name: 'RAG Pipeline',
    cost: 550,
    description: 'Document Q&A search',
    tier: 4,
    port: 3135,
    directoryName: 'rag-pipeline',
  },
  {
    type: 'AutonomousAgentFramework',
    name: 'Autonomous Agent Framework',
    cost: 600,
    description: 'Agent task board',
    tier: 4,
    port: 3136,
    directoryName: 'autonomous-agent-framework',
  },
];

// ── Helper functions ─────────────────────────────────────────────────

/** Get buildings for a page. Page 1 = infra + tier 1, pages 2-4 = tiers 2-4. */
export function getBuildingsForPage(page: number): BuildingDef[] {
  if (page === 1) return ALL_BUILDINGS.filter(b => b.tier <= 1);
  return ALL_BUILDINGS.filter(b => b.tier === page);
}

export function getPageTitle(page: number): string {
  if (page === 1) return TIER_NAMES[1];
  return TIER_NAMES[page] ?? `TIER ${page}`;
}

export const TOTAL_PAGES = 4;

export function buildingTypeToId(type: string): string {
  return type.replace(/([A-Z])/g, (_, p1: string, offset: number) =>
    offset > 0 ? '_' + p1.toLowerCase() : p1.toLowerCase(),
  );
}
