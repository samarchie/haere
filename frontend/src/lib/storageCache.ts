export function readJsonFromStorage<T>(key: string): T | null {
  try {
    const hit = localStorage.getItem(key);
    return hit === null ? null : (JSON.parse(hit) as T);
  } catch {
    return null; // localStorage unavailable (private mode, SSR) or corrupt entry.
  }
}

export function writeJsonToStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable - caching is best-effort.
  }
}
