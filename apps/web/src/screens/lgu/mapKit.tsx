// SPEC: 10 — pieces shared by the two Leaflet maps (priority hotspots on /lgu, access gap on /lgu/plan).
// Only imported from lazily loaded map modules, so Leaflet stays out of the main chunk.
import "leaflet/dist/leaflet.css";
import type L from "leaflet";
import { useMemo, useState, type ReactNode } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import { useCopy } from "../../copy/i18n";
import { CATBALOGAN_BOUNDS, CATBALOGAN_CENTER, CATBALOGAN_ZOOM } from "../../contracts/spec10";
import { Icon, PATHS, type IconName } from "../../ui/Icon";

// hex mirrors the index.css tokens: Leaflet draws circles as SVG attributes, which can't read CSS variables.
export const HEX = { ink: "#0d2e42", tide: "#1a6e9c", water: "#248dc5", sky: "#a3d0e8", coral: "#f4846c", coralDeep: "#b23f2a" };

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const svg = (name: IconName, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;

const mix = (a: string, b: string, t: number) => {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, "0")).join("");
};
/** Sky to ink by need relative to the highest need; sqrt so mid values stay distinguishable. */
export const needFill = (need: number, maxNeed: number) => mix(HEX.sky, HEX.ink, maxNeed > 0 ? Math.sqrt(need / maxNeed) : 0);

/** Radius in px: area grows with people, capped so the city stays readable. */
export const circleRadius = (people: number, maxPeople: number, min = 5, span = 20) =>
  min + span * Math.sqrt(maxPeople > 0 ? people / maxPeople : 0);

type Pt = { lat: number; lng: number };
export type LabelSide = "right" | "left" | "top" | "bottom";
const SIDES: [LabelSide, number, number][] = [["right", 1, 0], ["bottom", 0, -1], ["left", -1, 0], ["top", 0, 1]];

/** Put each name on the side with the fewest close neighbours, so labels don't run into nearby pins. */
export function labelSide(point: Pt, others: Pt[]): LabelSide {
  let best: LabelSide = "right";
  let bestCrowd = Infinity;
  for (const [side, x, y] of SIDES) {
    let crowd = 0;
    for (const o of others) {
      const dx = o.lng - point.lng;
      const dy = o.lat - point.lat;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      if ((dx * x + dy * y) / dist > 0.35) crowd += 1 / dist;
    }
    if (crowd < bestCrowd) [best, bestCrowd] = [side, crowd];
  }
  return best;
}

export const LABEL_OFFSET: Record<LabelSide, (r: number) => [number, number]> = {
  right: (r) => [r + 4, 0],
  left: (r) => [-(r + 4), 0],
  top: (r) => [0, -(r + 2)],
  bottom: (r) => [0, r + 2],
};

export function MapButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press flex size-11 items-center justify-center rounded-sm bg-foam text-ink shadow-[0_2px_8px_rgb(13_46_66/0.18)] transition-colors duration-150 hover:bg-mist focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** Catbalogan map frame: tiles, zoom buttons, offline notice. `overlay` sits over the map; `children` are Leaflet layers. */
export function MapShell({ ariaLabel, overlay, children }: { ariaLabel: string; overlay?: ReactNode; children: ReactNode }) {
  const { t } = useCopy();
  const [map, setMap] = useState<L.Map | null>(null);
  const [tilesFailed, setTilesFailed] = useState(() => !navigator.onLine);
  const reduce = useMemo(reduceMotion, []);
  const home = () => map?.flyTo(CATBALOGAN_CENTER, CATBALOGAN_ZOOM, { animate: !reduce, duration: 0.6 });

  return (
    <div className="pia-map relative h-[480px] overflow-hidden rounded-xl bg-mist">
      <MapContainer
        ref={setMap}
        center={CATBALOGAN_CENTER}
        zoom={CATBALOGAN_ZOOM}
        minZoom={11}
        maxBounds={CATBALOGAN_BOUNDS}
        maxBoundsViscosity={0.8}
        zoomControl={false}
        scrollWheelZoom={false}
        zoomAnimation={!reduce}
        fadeAnimation={!reduce}
        markerZoomAnimation={!reduce}
        className="h-full w-full"
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          eventHandlers={{ tileerror: () => setTilesFailed(true), tileload: () => setTilesFailed(false) }}
        />
        {children}
      </MapContainer>

      {overlay}

      <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5" role="group" aria-label={ariaLabel}>
        <MapButton icon="plus" label={t("lgu.map_zoom_in")} onClick={() => map?.zoomIn(1, { animate: !reduce })} />
        <MapButton icon="minus" label={t("lgu.map_zoom_out")} onClick={() => map?.zoomOut(1, { animate: !reduce })} />
        <MapButton icon="fit" label={t("lgu.map_fit")} onClick={home} />
      </div>

      {tilesFailed && (
        <p role="status" className="absolute inset-x-3 bottom-[76px] z-[1000] rounded-lg bg-ink px-3 py-2 text-[14px] text-foam sm:left-auto sm:max-w-[360px]">
          {t("lgu.map_offline")}
        </p>
      )}
    </div>
  );
}
