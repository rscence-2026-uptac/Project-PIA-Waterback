// Shared HTTP helpers for the spec 03 / 07 functions (CORS + JSON + as_of parsing). Pure: no Deno APIs.
import { CORS_HEADERS } from "./handler.ts";
export { CORS_HEADERS };

export const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

export const preflight = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** as_of: full ISO 8601 with offset/Z (a bare datetime is timezone-ambiguous). Missing/empty -> now. An unencoded "+" in a query string arrives as a space. */
export function parseAsOf(raw: unknown, now: Date): { ok: true; asOf: Date } | { ok: false; error: string } {
  if (typeof raw === "string") raw = raw.replace(/ /g, "+");
  if (raw == null || raw === "") return { ok: true, asOf: now };
  const d = typeof raw === "string" && ISO_RE.test(raw) ? new Date(raw) : new Date(NaN);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "as_of must be an ISO 8601 timestamp with offset, e.g. 2026-07-02T06:00:00+08:00" };
  return { ok: true, asOf: d };
}
