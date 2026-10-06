// Minimal in-memory stand-in for the supabase-js query builder (only what _shared/supabase_data.ts uses).
// deno-lint-ignore-file no-explicit-any
import { randomUUID } from "node:crypto";

type Filter = (r: any) => boolean;
export class FakeSupabase {
  tables: Record<string, any[]> = {};
  calls: string[] = [];
  /** Make the next insert into `table` fail with a unique violation (simulates losing a race). */
  failNextInsert: Record<string, boolean> = {};
  /** Hook run once right before the next insert into a table (to simulate a concurrent writer). */
  beforeInsert: Record<string, () => void> = {};
  constructor(seed: Record<string, any[]> = {}) { for (const [k, v] of Object.entries(seed)) this.tables[k] = structuredClone(v); }
  rows(t: string) { return (this.tables[t] ??= []); }
  from(t: string) { return new Query(this, t); }
}

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private conflict: string[] = [];
  private payload: any;
  private orders: { c: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private rng: [number, number] | null = null;
  private mode: "many" | "maybe" | "single" = "many";
  constructor(private db: FakeSupabase, private t: string) {}
  select(_cols?: string) { return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o: { onConflict?: string } = {}) { this.op = "upsert"; this.payload = p; this.conflict = (o.onConflict ?? "id").split(",").map((s) => s.trim()); return this; }
  in(c: string, v: any[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.orders.push({ c, asc: o.ascending ?? true }); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }
  then<R1, R2>(ok?: ((v: { data: any; error: any }) => R1 | PromiseLike<R1>) | null, bad?: ((e: any) => R2 | PromiseLike<R2>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
  private run(): { data: any; error: any } {
    const db = this.db, rows = db.rows(this.t);
    db.calls.push(`${this.op}:${this.t}`);
    if (this.op === "insert") {
      db.beforeInsert[this.t]?.(); delete db.beforeInsert[this.t];
      if (db.failNextInsert[this.t]) { db.failNextInsert[this.t] = false; return { data: null, error: { message: "duplicate key", code: "23505" } }; }
      const made = ([] as any[]).concat(this.payload).map((p) => ({ id: randomUUID(), resolved_at: null, ...p })); // bulk insert supported
      rows.push(...made);
      return this.shape(made);
    }
    if (this.op === "upsert") {
      const out: any[] = [];
      for (const p of [].concat(this.payload)) {
        const ex = rows.find((r) => this.conflict.every((c) => r[c] === (p as any)[c]));
        if (ex) { Object.assign(ex, p); out.push(ex); } else { const row = { id: randomUUID(), ...(p as any) }; rows.push(row); out.push(row); }
      }
      return this.shape(out);
    }
    let hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") { for (const r of hit) Object.assign(r, this.payload); return this.shape(hit); }
    for (const { c, asc } of [...this.orders].reverse()) hit = [...hit].sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc ? 1 : -1));
    if (this.rng) hit = hit.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) hit = hit.slice(0, this.lim);
    return this.shape(hit);
  }
  private shape(hit: any[]) {
    const copy = structuredClone(hit);
    if (this.mode === "many") return { data: copy, error: null };
    if (this.mode === "single" && copy.length !== 1) return { data: null, error: { message: "expected one row", code: "PGRST116" } };
    return { data: copy[0] ?? null, error: null };
  }
}
