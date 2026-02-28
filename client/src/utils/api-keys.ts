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
