// Shared HTTP plumbing for the spec 06 Edge Functions: CORS, JSON body, error mapping, zod -> 400.
import { z } from "./spec06_schemas.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

/** Parse with zod; any failure is a 400 `invalid_request` with a flat list of issues. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  throw new HttpError(400, "invalid_request", "request body failed validation", r.error.issues.map((i) => ({
    path: i.path.join("."), message: i.message,
  })));
}

/**
 * Wraps a function: OPTIONS -> 204, non-POST -> 405, bad JSON -> 400, HttpError -> its status, anything else -> 500.
 * `parseBody` = false hands the raw Request to `run` (used by the SMS webhook, whose body is form-encoded).
 */
export async function serve(
  req: Request,
  name: string,
  run: (body: unknown, req: Request) => Promise<unknown>,
  opts: { parseBody?: boolean } = {},
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { error: "method not allowed", code: "method_not_allowed" });
  try {
    let body: unknown = undefined;
    if (opts.parseBody !== false) {
      try { body = await req.json(); } catch { throw new HttpError(400, "invalid_json", "invalid JSON body"); }
    }
    return json(200, await run(body, req));
  } catch (e) {
    if (e instanceof HttpError) {
      return json(e.status, { error: e.message, code: e.code, ...(e.details !== undefined ? { details: e.details } : {}) });
    }
    console.error(`${name} failed`, e);
    return json(500, { error: "internal error", code: "internal" });
  }
}

/** Client-supplied timestamps are never trusted past `now` (a skewed phone clock must not reorder the log). */
export function clampToNow(iso: string, now: Date): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) || t > now.getTime() ? now.toISOString() : new Date(t).toISOString();
}
