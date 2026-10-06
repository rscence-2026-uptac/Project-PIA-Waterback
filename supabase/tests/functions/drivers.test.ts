import { describe, expect, it } from "vitest";
import { PredictorOutput } from "../../../packages/shared-types/src/index.ts";
import { driverText, operatorActions, PIA_REC } from "../../functions/_shared/drivers.ts";
import { predict } from "../../functions/_shared/predict.ts";
import type { ReadingRow } from "../../functions/_shared/predict.ts";
import { kuladorSeries, rainSeries, HOUR } from "./helpers.ts";

const ASOF = Date.parse("2026-07-22T12:00:00+08:00");
const asOf = new Date(ASOF);
const rain = rainSeries(ASOF, 90 * 24, (h) => (h < 24 ? 0.8 : 0.2));
const logit = (p: number) => Math.log(p / (1 - p));
const run = (o: { fc?: number | null; ntu?: number; pct?: number; readings?: ReadingRow[] } = {}) =>
  predict({
    readings: o.readings ?? kuladorSeries(ASOF, 6, () => ({ turbidity_ntu: o.ntu ?? 30, reservoir_pct: o.pct ?? 60 })),
    rainHourly: rain, asOf, forecastRain48hMm: o.fc === undefined ? 41 : o.fc, forecastSource: "seeded",
  });

describe("drivers (model path)", () => {
  const out = run();
  it("baseline + sum(contribution) == logit(p) within 1e-9, both models", () => {
    expect(out.fallback_used).toBe(false);
    for (const m of ["turbidity", "drought"] as const) {
      const sum = out.drivers!.turbidity && out.drivers![m].reduce((s, d) => s + (d.contribution as number), 0);
      expect(out.drivers!.baseline[m]! + sum).toBeCloseTo(logit(m === "turbidity" ? out.p_turbidity : out.p_drought), 9);
      expect(Math.abs(out.drivers!.baseline[m]! + sum - logit(m === "turbidity" ? out.p_turbidity : out.p_drought))).toBeLessThan(1e-9);
    }
  });
  it("sorted by contribution descending; contribution = weight x value; shares sum to 1 over positives", () => {
    for (const m of ["turbidity", "drought"] as const) {
      const ds = out.drivers![m];
      for (let i = 1; i < ds.length; i++) expect(ds[i - 1].contribution!).toBeGreaterThanOrEqual(ds[i].contribution!);
      const pos = ds.filter((d) => d.contribution! > 0);
      expect(pos.reduce((s, d) => s + d.share!, 0)).toBeCloseTo(pos.length ? 1 : 0, 12); // drought is all-negative on a wet day
      for (const d of ds.filter((d) => d.contribution! <= 0)) expect(d.share).toBe(0);
    }
  });
  it("forecast rain is the top turbidity driver with a readable text", () => {
    const top = out.drivers!.turbidity[0];
    expect(top.feature).toBe("forecast_rain_48h_mm");
    expect(top.value).toBe(41);
    expect(top.unit).toBe("mm");
    expect(top.text).toBe("41 mm of rain forecast in the next 48 h");
  });
  it("validates against the shared-types schema without losing fields", () => {
    expect(PredictorOutput.parse(out)).toEqual(out);
  });
});

describe("drivers (fallback)", () => {
  it("missing forecast -> turbidity drivers = wsp_rule, no turbidity baseline; drought still model", () => {
    const o = run({ fc: null, ntu: 300 });
    expect(o.fallback_used).toBe(true);
    expect(o.drivers!.turbidity).toHaveLength(1);
    expect(o.drivers!.turbidity[0].feature).toBe("wsp_rule");
    expect(o.drivers!.turbidity[0].text).toMatch(/250 NTU/);
    expect(o.drivers!.baseline.turbidity).toBeUndefined();
    expect(o.drivers!.baseline.drought).toBeDefined();
    expect(PredictorOutput.parse(o)).toEqual(o);
  });
  it("Caramayon I >= 500 NTU adds the p.43 rule in front of the model drivers", () => {
    const car: ReadingRow = { ...kuladorSeries(ASOF, 1)[0], intake_id: "caramayon_1", turbidity_ntu: 620 };
    const o = run({ fc: 0, readings: [...kuladorSeries(ASOF, 6), car] });
    expect(o.turbidity_level).toBe(4);
    expect(o.drivers!.turbidity[0].feature).toBe("wsp_rule");
    expect(o.drivers!.turbidity[0].text).toMatch(/p\.43/);
    const model = o.drivers!.turbidity.filter((d) => d.feature !== "wsp_rule");
    expect(model).toHaveLength(4);
    expect(o.operator_actions!.some((a) => /500 NTU/.test(a.action) && a.source === "WSP p.43")).toBe(true);
  });
  it("no readings at all -> both wsp_rule", () => {
    const o = run({ readings: [] });
    expect(o.drivers!.turbidity[0].feature).toBe("wsp_rule");
    expect(o.drivers!.drought[0].feature).toBe("wsp_rule");
  });
});

describe("operator_actions selection", () => {
  const srcs = (l: number, d: number, tt?: string, td?: string) => operatorActions(l, d, tt, td);
  it("levels 0-1 -> none", () => { expect(srcs(0, 0)).toEqual([]); expect(srcs(1, 1)).toEqual([]); });
  it("turbidity 2-3 -> pre-dose (p.44), reservoir (p.13), generator (p.43); no shut-off", () => {
    for (const l of [2, 3]) {
      const a = srcs(l, 0);
      expect(a.find((x) => /Pre-dose PAC\/polymer and caustic soda at Kulador/.test(x.action))?.source).toBe("WSP p.44");
      expect(a.find((x) => /440 m3 reservoir/.test(x.action))?.source).toBe("WSP p.13");
      expect(a.find((x) => /generator/.test(x.action))?.source).toBe("WSP p.43");
      expect(a.some((x) => /500 NTU/.test(x.action))).toBe(false);
    }
  });
  it("turbidity 4 adds the Caramayon I shut-off (p.43)", () => {
    expect(srcs(4, 0).find((x) => /500 NTU/.test(x.action))?.source).toBe("WSP p.43");
  });
  it("top driver adds a PIA recommendation, never a WSP citation", () => {
    const a = srcs(2, 0, "forecast_rain_48h_mm");
    const extra = a.filter((x) => x.when.includes("top driver"));
    expect(extra).toHaveLength(1);
    expect(extra[0].source).toBe(PIA_REC);
  });
  it("drought >= 2 -> WSP-grounded notes plus a labelled PIA advisory", () => {
    const a = srcs(0, 2);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.every((x) => x.source === PIA_REC || /^WSP pp?\.\d/.test(x.source))).toBe(true);
    expect(a.find((x) => /conservation/.test(x.action))?.source).toBe(PIA_REC);
    expect(a.some((x) => /Pre-dose/.test(x.action))).toBe(false);
  });
  it("end-to-end: predict() at turbidity>=2 carries the actions", () => {
    const o = run();
    expect(o.turbidity_level).toBeGreaterThanOrEqual(2);
    expect(o.operator_actions!.length).toBeGreaterThanOrEqual(4);
    expect(o.operator_actions!.every((a) => a.source.length > 0 && a.when.length > 0)).toBe(true);
  });
});

describe("driverText formatting", () => {
  it.each([
    ["forecast_rain_48h_mm", 41.04, "41 mm of rain forecast in the next 48 h"],
    ["rain_24h_mm", 3.26, "3.3 mm of rain fell in the last 24 h"],
    ["rain_72h_mm", 0, "0 mm of rain fell in the last 72 h"],
    ["turbidity_ntu", 250, "Kulador raw-water turbidity is 250 NTU now"],
    ["reservoir_pct", 55.5, "Reservoir at 56% of its 340 m3 usable capacity"],
    ["days_since_rain_over_5mm", 0, "Rain of 5 mm or more fell today"],
    ["days_since_rain_over_5mm", 1, "1 day since a day with 5 mm or more of rain"],
    ["days_since_rain_over_5mm", 6, "6 days since a day with 5 mm or more of rain"],
  ])("%s %f", (f, v, text) => { expect(driverText(f, v)).toBe(text); });
});
void HOUR;
