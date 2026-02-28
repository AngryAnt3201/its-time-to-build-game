# Title Screen Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a React-based title screen overlay with settings modal for API key management, gating game start behind a "Play" button.

**Architecture:** React mounts in a dedicated `#ui-root` div that sits above the PixiJS canvas. The `<TitleScreen>` component renders the title, play button, and settings gear. When "Play" is clicked, a callback triggers PixiJS initialization in `main.ts` and the React overlay unmounts. API keys are stored in localStorage via a shared utility module.

**Tech Stack:** React 19, ReactDOM, @vitejs/plugin-react, CSS modules, localStorage

---

### Task 1: Add React dependencies and configure build tooling

**Files:**
- Modify: `client/package.json`
- Modify: `client/tsconfig.json`
- Modify: `client/vite.config.ts`

**Step 1: Install React and Vite plugin**

Run from `client/`:
```bash
npm install react react-dom
npm install -D @types/react @types/react-dom @vitejs/plugin-react
```

**Step 2: Update tsconfig.json for React JSX**

Change `"jsx": "preserve"` to `"jsx": "react-jsx"` in `compilerOptions`.

**Step 3: Update vite.config.ts to use React plugin**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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

**Step 4: Verify build works**

Run: `cd client && npm run build`
Expected: Builds successfully with no errors.

**Step 5: Commit**

```bash
git add client/package.json client/package-lock.json client/tsconfig.json client/vite.config.ts
git commit -m "chore: add React dependencies and configure Vite plugin"
```

---

### Task 2: Create API key storage utility

**Files:**
- Create: `client/src/utils/api-keys.ts`

**Step 1: Create the utility module**

```ts
const KEYS = {
  mistral: 'mistral_api_key',
  elevenlabs: 'elevenlabs_api_key',
} as const;

export type ApiService = keyof typeof KEYS;

export function getApiKey(service: ApiService): string | null {
  return localStorage.getItem(KEYS[service]);
}

export function setApiKey(service: ApiService, key: string): void {
  localStorage.setItem(KEYS[service], key);
}

export function hasApiKey(service: ApiService): boolean {
  const key = localStorage.getItem(KEYS[service]);
  return key !== null && key.length > 0;
}
```

**Step 2: Commit**

```bash
git add client/src/utils/api-keys.ts
git commit -m "feat: add localStorage API key utility"
```

---

### Task 3: Create the TitleScreen React component and CSS

**Files:**
- Create: `client/src/ui/title-screen/TitleScreen.tsx`
- Create: `client/src/ui/title-screen/TitleScreen.css`
- Create: `client/src/ui/title-screen/SettingsModal.tsx`

**Step 1: Create TitleScreen.css**

Style to match the game's pixel-art aesthetic:
- Background: `#0a0a0a` (matches body)
- Panel colors: `#1a1510` (dark brown), `#3a3020` (border)
- Text: `#d4a017` (amber)
- Font: `'IBM Plex Mono', monospace`
- Full-screen fixed overlay with z-index above canvas
- Retro button styling with pixel-art border feel
- Settings gear icon positioned top-right
- Modal overlay with centered panel

Key CSS classes:
- `.title-screen` — full-screen overlay, flexbox centering
- `.title-main` / `.title-sub` — title text styling
- `.play-btn` — large centered play button with hover/active states
- `.settings-gear` — top-right gear icon button
- `.modal-backdrop` — semi-transparent dark overlay
- `.modal-panel` — centered settings panel
- `.input-group` — label + input + show/hide toggle
- `.save-btn` — save button in modal

**Step 2: Create SettingsModal.tsx**

Props: `{ open: boolean; onClose: () => void }`

- Two input fields: Mistral API Key, ElevenLabs API Key
- Password-masked with show/hide toggle per field
- Pre-fills from localStorage on mount via `getApiKey()`
- Save button calls `setApiKey()` for both, then `onClose()`
- Click on backdrop closes modal

**Step 3: Create TitleScreen.tsx**

Props: `{ onPlay: () => void }`

- Renders title text: "IT'S TIME TO BUILD" (large) and "THE EXPERIENCE" (smaller, below)
- Play button centered below title
- Gear icon top-right corner, toggles SettingsModal
- Play button calls `onPlay` prop

**Step 4: Verify it renders in isolation**

Temporarily mount in main.ts to check visual appearance.

**Step 5: Commit**

```bash
git add client/src/ui/title-screen/
git commit -m "feat: add TitleScreen and SettingsModal React components"
```

---

### Task 4: Wire up React mount and gate PixiJS initialization

**Files:**
- Modify: `client/index.html`
- Modify: `client/src/main.ts`

**Step 1: Add React root div to index.html**

Add `<div id="ui-root"></div>` to the body, before the script tag. This div sits above the canvas (handled by CSS z-index).

**Step 2: Refactor main.ts to gate game behind title screen**

Current structure:
```
async function init() { ... full game setup ... }
init();
```

New structure:
```
import { createRoot } from 'react-dom/client';
import { TitleScreen } from './ui/title-screen/TitleScreen';

function startGame() {
  // Remove React overlay
  const uiRoot = document.getElementById('ui-root')!;
  uiRoot.style.display = 'none';

  // ... existing init() code (PixiJS setup, renderers, game loop, etc.)
}

// Mount React title screen
const uiRoot = document.getElementById('ui-root')!;
const root = createRoot(uiRoot);
root.render(<TitleScreen onPlay={startGame} />);
```

Key changes:
- Rename `init()` to `startGame()`
- Remove the `init()` call at the bottom
- Add React imports and mount the TitleScreen
- `onPlay` callback hides ui-root and runs the game init
- Rename `main.ts` to `main.tsx` (required for JSX)
- Update `index.html` script src to `/src/main.tsx`

**Step 3: Verify full flow works**

Run: `cd client && npm run dev`
Expected:
1. Title screen appears with "IT'S TIME TO BUILD" / "THE EXPERIENCE"
2. Gear icon opens settings modal, can enter/save API keys
3. Clicking "Play" hides title screen and starts the game
4. Game functions normally after transition

**Step 4: Commit**

```bash
git add client/index.html client/src/main.tsx
git rm client/src/main.ts
git commit -m "feat: wire React title screen with gated PixiJS initialization"
```

---

### Task 5: Polish and verify

**Files:**
- Possibly tweak: `client/src/ui/title-screen/TitleScreen.css`

**Step 1: Visual polish pass**

- Ensure title text has appropriate sizing and spacing
- Verify settings modal looks clean on different viewport sizes
- Check that amber/brown colors match existing HUD aesthetic
- Verify gear icon is visible but not intrusive

**Step 2: Verify localStorage persistence**

1. Enter API keys in settings, save
2. Refresh the page
3. Open settings — keys should be pre-filled

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: title screen polish and final adjustments"
```
