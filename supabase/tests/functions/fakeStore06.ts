// In-memory Store for the spec 06 function tests (mirrors the real constraints: unique client_local_id, status guards).
import type {
  BarangayRow, DisruptionRow, EventRow, NewAllocation, NewEvent, NewReading, ResidentRow, SourceRow, Store,
} from "../../functions/_shared/spec06_store.ts";

export const D1 = "3f6b2f0e-6d57-4c53-9a0c-1b2c3d4e5f60";
export const SRC1 = "8a1d4a52-3c1e-4d0b-8f5e-2a9b7c6d5e41";

export class FakeStore implements Store {
  disruptions = new Map<string, DisruptionRow>();
  barangays: BarangayRow[] = [];
  sources: SourceRow[] = [];
  chains = new Map<string, string[]>();
  allocations: NewAllocation[] = [];
  events: (NewEvent & { client_local_id: string | null })[] = [];
  readings: NewReading[] = [];
  residents: ResidentRow[] = [];
  calls = 0; // store round trips, to keep an eye on the latency budget
  failReadings = false;

  constructor() {
    this.disruptions.set(D1, {
      id: D1, status: "confirmed", cause: "turbidity", started_at: "2026-10-06T03:45:00Z", resolved_at: null,
      window_start: "2026-10-06T03:00:00Z", window_end: "2026-10-06T06:00:00Z", likely_at: "2026-10-06T04:30:00Z", next_update_at: null,
    });
    for (const [id, name, wsp] of [["payao", "Payao", null], ["maulong", "Maulong", null], ["poblacion-05", "Poblacion 5 (Barangay 5)", "Poblacion 5"]] as const) {
      this.barangays.push({ barangay_id: id, name, wsp_name: wsp, service_level: "level_iii" });
    }
    this.sources.push({ id: SRC1, name: "Bayani Refilling", barangay_id: "payao" });
  }
  get status() { return this.disruptions.get(D1)!.status; }
  evs(type?: string, barangay?: string) {
    return this.events.filter((e) => (!type || e.event_type === type) && (!barangay || e.barangay_id === barangay));
  }

  async getDisruption(id: string) { this.calls++; return this.disruptions.get(id) ?? null; }
  async getActiveDisruption() { return [...this.disruptions.values()].find((d) => d.status !== "resolved") ?? null; }
  async getBarangays(ids: string[]) { return this.barangays.filter((b) => ids.includes(b.barangay_id)); }
  async getSource(id: string) { return this.sources.find((s) => s.id === id) ?? null; }
  async getChainSourceIds(d: string, b: string) { return this.chains.get(`${d}/${b}`) ?? null; }
  async insertAllocations(rows: NewAllocation[]) { this.allocations.push(...rows); }
  async insertEvents(events: NewEvent[]) {
    return events.map((e) => {
      const key = e.client_local_id ?? null;
      if (key && this.events.some((x) => x.client_local_id === key)) return false;
      this.events.push({ ...e, client_local_id: key });
      return true;
    });
  }
  async listEvents(id: string): Promise<EventRow[]> {
    return this.events.filter((e) => e.disruption_id === id).map((e) => ({ ...e }));
  }
  async setDisruptionStatus(id: string, to: DisruptionRow["status"], from: DisruptionRow["status"][], resolvedAt?: string) {
    const d = this.disruptions.get(id);
    if (!d || !from.includes(d.status)) return false;
    d.status = to;
    if (resolvedAt) d.resolved_at = resolvedAt;
    return true;
  }
  async getSmsResidents(ids: string[]) { return this.residents.filter((r) => ids.includes(r.barangay_id) && r.channel === "sms" && r.phone); }
  async findResidentByPhone(p: string) { return this.residents.find((r) => r.phone === p) ?? null; }
  async insertReading(row: NewReading) {
    if (this.failReadings) throw new Error("db down");
    if (this.readings.some((r) => r.client_local_id === row.client_local_id)) return "duplicate" as const;
    this.readings.push(row);
    return "inserted" as const;
  }
}

export const resident = (n: number, barangay: string, lang: ResidentRow["preferred_language"] = "english", channel: "sms" | "pwa" = "sms"): ResidentRow => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, barangay_id: barangay,
  phone: `+63917${String(1000000 + n)}`, display_name: `R${n}`, preferred_language: lang, channel,
});
