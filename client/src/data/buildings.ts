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
    description: 'Illuminates surrounding area. Safety.',
    tier: 0,
    port: 0,
    directoryName: '',
  },
  {
    type: 'ComputeFarm',
    name: 'Compute Farm',
    cost: 80,
    description: 'Rows of humming racks. Tokens trickle in.',
    tier: 0,
    port: 0,
    directoryName: '',
  },

  // ── Tier 1 — Hut Era ──────────────────────────────────────────────
  {
    type: 'TodoApp',
    name: 'Todo App',
    cost: 50,
    description: 'A task manager with CRUD, drag-and-drop reordering, and filters.',
    tier: 1,
    port: 3101,
    directoryName: 'todo-app',
  },
  {
    type: 'Calculator',
    name: 'Calculator',
    cost: 60,
    description: 'A scientific calculator with history tape and keyboard input.',
    tier: 1,
    port: 3102,
    directoryName: 'calculator',
  },
  {
    type: 'LandingPage',
    name: 'Landing Page',
    cost: 40,
    description: 'A single-page marketing site with hero, features, and CTA sections.',
    tier: 1,
    port: 3103,
    directoryName: 'landing-page',
  },

  // ── Tier 2 — Outpost Era ──────────────────────────────────────────
  {
    type: 'WeatherDashboard',
    name: 'Weather Dashboard',
    cost: 120,
    description: 'A live weather dashboard with forecasts, maps, and location search.',
    tier: 2,
    port: 3111,
    directoryName: 'weather-dashboard',
  },
  {
    type: 'ChatApp',
    name: 'Chat App',
    cost: 150,
    description: 'A real-time messaging app with rooms, typing indicators, and history.',
    tier: 2,
    port: 3112,
    directoryName: 'chat-app',
  },
  {
    type: 'KanbanBoard',
    name: 'Kanban Board',
    cost: 130,
    description: 'A project management board with columns, cards, and drag-and-drop.',
    tier: 2,
    port: 3113,
    directoryName: 'kanban-board',
  },

  // ── Tier 3 — Village Era ──────────────────────────────────────────
  {
    type: 'EcommerceStore',
    name: 'E-commerce Store',
    cost: 250,
    description: 'A storefront with product catalog, cart, and checkout flow.',
    tier: 3,
    port: 3121,
    directoryName: 'ecommerce-store',
  },
  {
    type: 'AiImageGenerator',
    name: 'AI Image Generator',
    cost: 300,
    description: 'An image generation UI with prompt input, gallery, and style controls.',
    tier: 3,
    port: 3122,
    directoryName: 'ai-image-generator',
  },
  {
    type: 'ApiDashboard',
    name: 'API Dashboard',
    cost: 280,
    description: 'An API monitoring dashboard with endpoint stats and request logs.',
    tier: 3,
    port: 3123,
    directoryName: 'api-dashboard',
  },

  // ── Tier 4 — Network Era ──────────────────────────────────────────
  {
    type: 'Blockchain',
    name: 'Blockchain',
    cost: 500,
    description: 'A blockchain explorer with block visualization and transaction history.',
    tier: 4,
    port: 3131,
    directoryName: 'blockchain',
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
