// SPEC: 06 / 07 — the one fetch wrapper for Dev A's Supabase Edge Functions (see supabase/functions/README.md).
// Base: ${VITE_SUPABASE_URL}/functions/v1/<name>. The anon key is public by design (it ships in the bundle);
// the functions use the service role internally. Never put the service-role key in a VITE_* variable.
const URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, "");
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both env vars are present. When false the app stays on its `// MOCK:` data. */
export const backendConfigured = Boolean(URL_BASE && ANON_KEY);

const TIMEOUT_MS = 12_000;

export class ApiError extends Error {
  readonly status: number; // 0 = network error or timeout
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function callFunction<T>(
  name: string,
  opts: { method?: "GET" | "POST"; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  if (!URL_BASE || !ANON_KEY) throw new ApiError(0, "not_configured", "Server is not configured");
  const method = opts.method ?? "POST";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) params.set(k, String(v));
  const qs = params.size > 0 ? `?${params}` : "";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL_BASE}/functions/v1/${name}${qs}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = (data ?? {}) as { error?: string; code?: string };
      throw new ApiError(res.status, err.code ?? "http_error", err.error ?? `${name} failed (${res.status})`);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    throw new ApiError(0, timedOut ? "timeout" : "network", timedOut ? "The server took too long to answer" : "Could not reach the server");
  } finally {
    clearTimeout(timer);
  }
}
