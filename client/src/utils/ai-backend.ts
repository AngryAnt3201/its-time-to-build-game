export type AiBackend = 'MistralVibe' | 'ClaudeCode';

const STORAGE_KEY = 'ai_backend';

export function getAiBackend(): AiBackend | null {
  return localStorage.getItem(STORAGE_KEY) as AiBackend | null;
}

export function setAiBackend(backend: AiBackend): void {
  localStorage.setItem(STORAGE_KEY, backend);
}
