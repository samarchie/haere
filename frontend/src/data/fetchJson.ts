export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export async function fetchJson<T>(
  url: string,
  timeoutMs = 10_000,
): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new FetchError(
      `Fetch failed for ${url}: ${response.status}`,
      response.status,
    );
  }
  return (await response.json()) as T;
}
