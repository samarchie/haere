export function memoizeAsync<Args extends unknown[], T>(
  fn: (...args: Args) => Promise<T>,
  keyFor: (...args: Args) => string,
): (...args: Args) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (...args: Args) => {
    const key = keyFor(...args);
    let cached = cache.get(key);
    if (!cached) {
      cached = fn(...args);
      cached.catch(() => cache.delete(key));
      cache.set(key, cached);
    }
    return cached;
  };
}
