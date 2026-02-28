# Title Screen Design

## Overview
A React-based title screen overlay for "It's Time to Build - The Experience". This is the first step in a broader migration of HTML overlay UI to React, while PixiJS continues to handle in-game rendering.

## Architecture

React mounts alongside the PixiJS canvas in `index.html`. The title screen is a full-screen overlay that sits on top of the canvas. When the user clicks "Play", the overlay hides and the PixiJS game initializes underneath.

### Component Tree
```
<TitleScreen>
  <Title />           -- "IT'S TIME TO BUILD" / "THE EXPERIENCE"
  <PlayButton />       -- Centered, styled as retro game button
  <SettingsIcon />     -- Gear icon, corner-positioned
  <SettingsModal />    -- Conditional, opens on gear click
    <ApiKeyInput />    -- Mistral API Key (password-masked)
    <ApiKeyInput />    -- ElevenLabs API Key (password-masked)
    <SaveButton />
</TitleScreen>
```

### State Flow
1. Title screen renders on load (game canvas hidden or behind overlay)
2. User optionally opens settings, enters API keys, saves to localStorage
3. User clicks "Play"
4. Title screen unmounts, PixiJS game starts

## API Key Storage

Utility module `client/src/utils/api-keys.ts`:
- `getApiKey(service: 'mistral' | 'elevenlabs'): string | null`
- `setApiKey(service: 'mistral' | 'elevenlabs', key: string): void`
- Backed by localStorage with keys: `mistral_api_key`, `elevenlabs_api_key`

## Visual Design

- **Background**: Dark (0x0a0a0a) with space for future backdrop image
- **Panel backgrounds**: Dark brown (0x1a1510)
- **Text/accents**: Amber (0xd4a017)
- **Borders**: Darker brown (0x3a3020)
- **Font**: IBM Plex Mono (monospace)
- **Aesthetic**: Retro pixel-art game menu feel, consistent with existing HUD panels

### Settings Modal
- Dark semi-transparent backdrop
- Centered panel with amber border
- Password-masked inputs with show/hide toggle
- Pre-fills from localStorage if keys exist
- Close via X button or clicking outside

## Integration Points
- `index.html`: Add React root div above canvas
- `main.ts`: Gate PixiJS initialization behind title screen callback
- New files: React components + CSS + api-keys utility
