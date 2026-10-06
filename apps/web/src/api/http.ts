// Edge Function transport: anon key headers, JSON, one typed error. Every function is CORS-open.
import type { ZodType } from "zod";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isLive } from "./client";

/** An Edge Function answered with an error, or could not be reached (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly details: unknown;
  constructor(fn: string, status: number, message: string, code: string | null = null, details: unknown = undefined) {
    super(`${fn}: ${message}`);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The app is not in live mode, so there is no backend to call. */
export class NotLiveError extends Error {
  constructor(fn: string) {
    super(`${fn}: live mode is off (no Supabase env vars)`);
  }
}

/** ISO 8601 for as_of query/body values: the demo clock, as a UTC instant. */
export const asOfParam = (asOf: Date) => asOf.toISOString();

export async function callFn<T>(
  fn: string,
  opts: {
    method?: "GET" | "POST";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
    schema: ZodType<T>;
    signal?: AbortSignal;
  },
): Promise<T> {
  if (!isLive()) throw new NotLiveError(fn);
  const url = new URL(`${SUPABASE_URL}/functions/v1/${fn}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value)); // URLSearchParams encodes "+" as %2B
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(fn, 0, "network error");
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON error page: fall through with the raw status.
  }
  if (!res.ok) {
    const err = (json && typeof json === "object" ? json : {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(fn, res.status, err.error ?? `HTTP ${res.status}`, err.code ?? null, err.details);
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) throw new ApiError(fn, res.status, `unexpected response shape: ${parsed.error.issues[0]?.message ?? "invalid"}`, "bad_response", parsed.error.issues);
  return parsed.data;
}
