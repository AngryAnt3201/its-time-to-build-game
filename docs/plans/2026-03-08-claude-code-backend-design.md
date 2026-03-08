# Claude Code AI Backend — Design

## Goal

Add Claude Code as a second AI backend alongside Mistral Vibe, selectable via prominent cards on the main menu.

## Key Decisions

- Keep Mistral Vibe as-is, add Claude Code as alternative
- Prominent selection UI (two cards on main menu)
- Claude Code uses existing machine auth (no API key needed)
- Mirror same constraints (max turns, tool restrictions) via Claude CLI flags

## Agent Tier to Claude Model Mapping

| Tier | Claude Model | Max Turns | Token Burn | Error Chance |
|------|-------------|-----------|------------|--------------|
| Apprentice | claude-haiku-4-5-20251001 | 5 | 3/tick | 15% |
| Journeyman | claude-sonnet-4-6 | 15 | 2/tick | 8% |
| Artisan | claude-sonnet-4-6 | 30 | 1/tick | 4% |
| Architect | claude-opus-4-6 | 50 | 1/tick | 2% |

## CLI Invocation

```
claude --model <model_id> --max-turns <N> --allowedTools <tools>
```

No API key management — uses existing machine auth.

## Server Changes

- New `AiBackend` enum (`MistralVibe | ClaudeCode`)
- Abstract session spawning to support both CLIs
- New `SetAiBackend` protocol action from client
- `generate_vibe_config()` extended to produce Claude configs
- No agent profile files needed for Claude

## Client Changes

- Main menu: two backend selection cards before entering game
- Backend choice persisted in localStorage
- Settings modal: only show Mistral API key when Mistral is selected
- Terminal overlay works identically (both are PTY streams)

## Unchanged

- PTY/xterm.js streaming architecture
- Agent state machine (Idle -> Walking -> Building)
- Terminal overlay UI
- All existing Mistral functionality
