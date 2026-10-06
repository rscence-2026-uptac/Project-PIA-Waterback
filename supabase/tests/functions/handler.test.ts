import { describe, expect, it } from "vitest";
import { PredictorOutput } from "../../../packages/shared-types/src/index.ts";
import { handleRequest } from "../../functions/_shared/handler.ts";
import { forecastSeries, kuladorSeries, rainSeries } from "./helpers.ts";
import type { RainHourRow } from "../../functions/_shared/predict.ts";

const NOW = new Date("2026-07-10T04:00:00Z");
let seen: [Date, Date] | null = null;
let withForecast = true;
const fetchData = async (from: Date, to: Date) => {
  seen = [from, to];
  return {
    readings: kuladorSeries(to.getTime(), 240), rainHourly: rainSeries(to.getTime(), 90 * 24, () => 0.1),
    forecastHourly: withForecast ? forecastSeries(to.getTime(), 0.25) : [],
  };
};
let liveCalls = 0;
let liveImpl: () => Promise<RainHourRow[]> = async () => { throw new Error("no network in tests"); };
const fetchLive = () => { liveCalls++; return liveImpl(); };
const call = (url: string, init?: RequestInit, now = NOW) => handleRequest(new Request(url, init), fetchData, () => now, fetchLive);

describe("handler", () => {
  it("OPTIONS preflight", async () => {
    const r = await call("http://x/f", { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("access-control-allow-headers")).toContain("apikey");
  });
  it("GET default as_of = now", async () => {
    withForecast = true;
    const r = await call("http://x/f");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const b = PredictorOutput.parse(await r.json());
    expect(b.computed_at).toBe(NOW.toISOString());
  });
  it("looks back 90 days for rain history", async () => {
    await call("http://x/f?as_of=2026-07-02T06:00:00%2B08:00");
    expect(seen![1].getTime() - seen![0].getTime()).toBe(90 * 24 * 3_600_000);
  });
  describe("forecast source selection", () => {
    const AS = "2026-07-02T06:00:00%2B08:00";
    it("seeded rows with full coverage -> seeded, no live call", async () => {
      withForecast = true; liveCalls = 0;
      const b = PredictorOutput.parse(await (await call(`http://x/f?as_of=${AS}`)).json());
      expect(b.forecast_source).toBe("seeded");
      expect(b.fallback_used).toBe(false);
      expect(liveCalls).toBe(0);
    });
    it("no seeded rows, as_of within 3 h of now -> live (mocked)", async () => {
      withForecast = false; liveCalls = 0;
      liveImpl = async () => forecastSeries(NOW.getTime(), 0.5);
      const b = PredictorOutput.parse(await (await call("http://x/f")).json()); // as_of defaults to now
      expect(b.forecast_source).toBe("live");
      expect(b.fallback_used).toBe(false);
      expect(liveCalls).toBe(1);
    });
    it("no seeded rows, as_of in the past (> 3 h) -> missing, live NOT called, fallback", async () => {
      withForecast = false; liveCalls = 0;
      const b = PredictorOutput.parse(await (await call(`http://x/f?as_of=${AS}`)).json());
      expect(b.forecast_source).toBe("missing");
      expect(b.fallback_used).toBe(true);
      expect(liveCalls).toBe(0);
    });
    it("live fetch fails or is incomplete -> missing + fallback", async () => {
      withForecast = false;
      liveImpl = async () => { throw new Error("boom"); };
      expect(((await (await call("http://x/f")).json()) as any).forecast_source).toBe("missing");
      liveImpl = async () => forecastSeries(NOW.getTime(), 0.5, 20);
      expect(((await (await call("http://x/f")).json()) as any).forecast_source).toBe("missing");
    });
    it("hung live fetch times out after 5 s -> missing", async () => {
      withForecast = false;
      liveImpl = () => new Promise(() => {});
      const t0 = Date.now();
      const b = (await (await call("http://x/f")).json()) as any;
      expect(b.forecast_source).toBe("missing");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(4900);
      expect(Date.now() - t0).toBeLessThan(8000);
    }, 12000);
    it("partial seeded coverage is not used", async () => {
      withForecast = true; liveCalls = 0;
      const f2 = async (from: Date, to: Date) => ({ ...(await fetchData(from, to)), forecastHourly: forecastSeries(to.getTime(), 1, 47) });
      const r = await handleRequest(new Request(`http://x/f?as_of=${AS}`), f2, () => NOW, fetchLive);
      expect(((await r.json()) as any).forecast_source).toBe("missing");
    });
    withForecast = true;
  });
  it("GET as_of (encoded and unencoded +08:00)", async () => {
    withForecast = true;
    for (const q of ["2026-07-02T06:00:00%2B08:00", "2026-07-02T06:00:00+08:00"]) {
      const r = await call(`http://x/f?as_of=${q}`);
      expect(r.status).toBe(200);
      expect((await r.json()).computed_at).toBe("2026-07-01T22:00:00.000Z");
      expect(seen![1].toISOString()).toBe("2026-07-01T22:00:00.000Z");
    }
  });
  it("POST JSON body", async () => {
    const r = await call("http://x/f", { method: "POST", body: JSON.stringify({ as_of: "2026-07-20T12:00:00+08:00" }) });
    expect((await r.json()).computed_at).toBe("2026-07-20T04:00:00.000Z");
  });
  it.each(["garbage", "2026-07-02", "2026-07-02T06:00:00", "2026-13-40T00:00:00Z"])("400 on bad as_of %s", async (v) => {
    const r = await call(`http://x/f?as_of=${encodeURIComponent(v)}`);
    expect(r.status).toBe(400);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });
  it("400 on bad JSON, 405 on other methods, 500 on data failure", async () => {
    expect((await call("http://x/f", { method: "POST", body: "{" })).status).toBe(400);
    expect((await call("http://x/f", { method: "DELETE" })).status).toBe(405);
    const r = await handleRequest(new Request("http://x/f"), async () => { throw new Error("db"); }, () => NOW);
    expect(r.status).toBe(500);
  });
});

describe("live forecast fetcher", () => {
  it("parses Open-Meteo hourly response, Manila local times -> UTC, 5 s abort signal", async () => {
    const { makeLiveFetcher, LIVE_FORECAST_URL } = await import("../../functions/_shared/forecast.ts");
    let url = "", sig: AbortSignal | undefined;
    const fake = (async (u: string, init?: RequestInit) => {
      url = u; sig = init?.signal ?? undefined;
      return new Response(JSON.stringify({ hourly: { time: ["2026-10-06T00:00", "2026-10-06T01:00", "2026-10-06T02:00"], precipitation: [0.1, null, 2] } }));
    }) as unknown as typeof fetch;
    const rows = await makeLiveFetcher(fake)();
    expect(url).toBe(LIVE_FORECAST_URL);
    expect(url).toContain("latitude=11.7769");
    expect(url).toContain("forecast_days=3");
    expect(rows).toEqual([{ ts: "2026-10-05T16:00:00.000Z", precipitation_mm: 0.1 }, { ts: "2026-10-05T18:00:00.000Z", precipitation_mm: 2 }]);
    expect(sig).toBeDefined();
    await expect(makeLiveFetcher((async () => new Response("x", { status: 500 })) as unknown as typeof fetch)()).rejects.toThrow(/500/);
  });
});
