// SPEC: 09 — where the affected barangays are and who is served first. One beacon per barangay at its
// seed centroid: numbered by its best place in the current order, coloured by that row's type, with a
// halo sized by affected connections. Rank 1 ripples and is named in the "served first" card.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import { useCopy } from "../../copy/i18n";
import { CATBALOGAN_BOUNDS, CATBALOGAN_CENTER, CATBALOGAN_ZOOM, CONSUMER_TYPES, type BarangayPoint, type ConsumerType } from "../../contracts/spec09";
import { Icon, PATHS, type IconName } from "../../ui/Icon";
import { TYPE_LOOK, TypeBadge } from "./consumerTypes";

export interface MapPin {
  barangay_id: string;
  name: string;
  rank: number; // best (lowest) current rank among the barangay's rows
  type: ConsumerType; // type of that row
  connections: number | null; // known non-LGU connections; null = coverage unknown
}

export interface ServedFirst {
  name: string;
  type: ConsumerType;
  count: string; // "2 facilities", "820 connections"
  detail: string | null; // facilities or needs, as on the list row
}

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const svg = (name: IconName, size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;

// Leaflet pins take an HTML string, built by hand so the bundle doesn't need react-dom/server.
function beaconIcon(pin: MapPin, top: boolean, active: boolean) {
  const look = TYPE_LOOK[pin.type];
  const size = top ? 54 : 40;
  const ring = active ? "outline-[3px] outline-offset-2 outline-ink" : "";
  const ripple = top ? `<span class="beacon-ring" style="color:${look.hex}"></span><span class="beacon-ring" style="color:${look.hex}"></span>` : "";
  const html =
    `<span class="relative block" style="width:${size}px;height:${size}px">${ripple}` +
    `<span class="relative flex h-full w-full items-center justify-center gap-0.5 rounded-full border-[3px] border-foam font-display text-foam shadow-[0_4px_10px_rgb(13_46_66/0.28)] ${look.pin} ${ring} ${top ? "text-[21px]" : "text-[16px]"}">` +
    `${svg(look.icon, top ? 16 : 13)}${pin.rank}</span></span>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

type LabelSide = "right" | "left" | "top" | "bottom";
const SIDES: [LabelSide, number, number][] = [["right", 1, 0], ["bottom", 0, -1], ["left", -1, 0], ["top", 0, 1]];

/** Put each name on the side with the fewest close neighbours, so labels don't run into nearby pins. */
function labelSide(point: BarangayPoint, others: BarangayPoint[]): LabelSide {
  let best: LabelSide = "right";
  let bestCrowd = Infinity;
  for (const [side, x, y] of SIDES) {
    let crowd = 0;
    for (const o of others) {
      const dx = o.lng - point.lng;
      const dy = o.lat - point.lat;
      const dist = Math.hypot(dx, dy);
      if (dist === 0) continue;
      if ((dx * x + dy * y) / dist > 0.35) crowd += 1 / dist; // neighbour lies on this side; closer = worse
    }
    if (crowd < bestCrowd) [best, bestCrowd] = [side, crowd];
  }
  return best;
}

const LABEL_OFFSET: Record<LabelSide, (r: number) => [number, number]> = {
  right: (r) => [r + 4, 0],
  left: (r) => [-(r + 4), 0],
  top: (r) => [0, -(r + 2)],
  bottom: (r) => [0, r + 2],
};

/** Halo radius in px: area grows with connections, so a barangay twice as big reads twice as big. */
function haloRadius(connections: number | null, max: number) {
  if (connections === null || max === 0) return 26;
  return 22 + 30 * Math.sqrt(connections / max);
}

export function PriorityMap({ points, pins, servedFirst, active, onActive, onSelect }: {
  points: BarangayPoint[];
  pins: MapPin[];
  servedFirst: ServedFirst | null;
  active: string | null;
  onActive: (barangayId: string | null) => void;
  onSelect: (barangayId: string) => void;
}) {
  const { t } = useCopy();
  const [map, setMap] = useState<L.Map | null>(null);
  const [tilesFailed, setTilesFailed] = useState(() => !navigator.onLine);
  const reduce = useMemo(reduceMotion, []);
  const byId = new Map(points.map((p) => [p.barangay_id, p]));
  const ranked = [...pins].sort((a, b) => a.rank - b.rank);
  const topRank = ranked[0]?.rank;
  const maxConnections = Math.max(0, ...pins.map((p) => p.connections ?? 0));
  const pinLabel = (pin: MapPin) => t("lgu.map_pin_label", { name: pin.name, rank: pin.rank, type: t(`type.${pin.type}`) });
  const home = () => map?.flyTo(CATBALOGAN_CENTER, CATBALOGAN_ZOOM, { animate: !reduce, duration: 0.6 });

  return (
    <section className="mt-4" aria-label={t("lgu.map_title")}>
      <div className="pia-map relative h-[440px] overflow-hidden rounded-xl bg-mist">
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

          {pins.map((pin) => {
            const point = byId.get(pin.barangay_id);
            if (!point) return null;
            const hex = TYPE_LOOK[pin.type].hex;
            const on = pin.barangay_id === active;
            return (
              <CircleMarker
                key={`halo-${pin.barangay_id}`}
                center={[point.lat, point.lng]}
                radius={haloRadius(pin.connections, maxConnections)}
                interactive={false}
                pathOptions={{
                  color: hex,
                  weight: on ? 2.5 : 1.5,
                  opacity: on ? 0.95 : 0.5,
                  fillColor: hex,
                  fillOpacity: on ? 0.26 : 0.12,
                  dashArray: pin.connections === null ? "5 5" : undefined,
                }}
              />
            );
          })}

          {pins.map((pin) => {
            const point = byId.get(pin.barangay_id);
            if (!point) return null;
            const top = pin.rank === topRank;
            const on = pin.barangay_id === active;
            return (
              <Marker
                key={`pin-${pin.barangay_id}`}
                position={[point.lat, point.lng]}
                icon={beaconIcon(pin, top, on)}
                title={pinLabel(pin)}
                alt={pinLabel(pin)}
                zIndexOffset={on ? 2000 : top ? 1000 : -pin.rank}
                eventHandlers={{
                  click: () => onSelect(pin.barangay_id),
                  mouseover: () => onActive(pin.barangay_id),
                  mouseout: () => onActive(null),
                }}
              >
                <Tooltip
                  permanent
                  direction={labelSide(point, points.filter((p) => p !== point))}
                  offset={LABEL_OFFSET[labelSide(point, points.filter((p) => p !== point))](top ? 27 : 20)}
                  className={`map-label ${top ? "map-label-top" : ""}`}
                >
                  {pin.name}
                </Tooltip>
              </Marker>
            );
          })}
        </MapContainer>

        {servedFirst && (
          <div className="pointer-events-none absolute left-3 top-3 z-[1000] hidden w-[264px] rounded-lg bg-ink p-4 text-foam shadow-[0_8px_24px_rgb(13_46_66/0.3)] sm:block">
            <p className="flex items-center gap-3">
              <span className="numeral flex size-11 shrink-0 items-center justify-center rounded-md bg-foam text-[26px] text-ink">1</span>
              <span className="min-w-0">
                <span className="block font-display text-[22px] leading-tight">{servedFirst.name}</span>
                <span className="block text-[14px] font-bold text-sky">{t("lgu.map_highest")}</span>
              </span>
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-2">
              <TypeBadge type={servedFirst.type} />
              <span className="text-[14px] font-bold">{servedFirst.count}</span>
            </p>
            {servedFirst.detail && <p className="mt-1.5 text-[14px] leading-snug text-sky">{servedFirst.detail}</p>}
          </div>
        )}

        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-1.5" role="group" aria-label={t("lgu.map_title")}>
          <MapButton icon="plus" label={t("lgu.map_zoom_in")} onClick={() => map?.zoomIn(1, { animate: !reduce })} />
          <MapButton icon="minus" label={t("lgu.map_zoom_out")} onClick={() => map?.zoomOut(1, { animate: !reduce })} />
          <MapButton icon="fit" label={t("lgu.map_fit")} onClick={home} />
        </div>

        {tilesFailed && (
          <p role="status" className="absolute inset-x-3 bottom-[76px] z-[1000] rounded-lg bg-ink px-3 py-2 text-[14px] text-foam sm:left-auto sm:max-w-[360px]">
            {t("lgu.map_offline")}
          </p>
        )}

        <ol
          aria-label={t("lgu.map_strip")}
          className="absolute inset-x-3 bottom-3 z-[1000] flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          {ranked.map((pin) => {
            const on = pin.barangay_id === active;
            const look = TYPE_LOOK[pin.type];
            return (
              <li key={pin.barangay_id} className="shrink-0">
                <button
                  type="button"
                  aria-label={pinLabel(pin)}
                  onClick={() => onSelect(pin.barangay_id)}
                  onMouseEnter={() => onActive(pin.barangay_id)}
                  onMouseLeave={() => onActive(null)}
                  onFocus={() => onActive(pin.barangay_id)}
                  onBlur={() => onActive(null)}
                  className={`flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-[15px] font-bold shadow-[0_2px_8px_rgb(13_46_66/0.18)] transition-colors duration-150 ${on ? "bg-ink text-foam" : "bg-foam text-ink"}`}
                >
                  <span className={`numeral flex size-9 items-center justify-center rounded-full text-[16px] text-foam ${look.pin}`}>{pin.rank}</span>
                  {pin.name}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-2" aria-label={t("lgu.map_legend_rule")}>
          {CONSUMER_TYPES.map((type, i) => (
            <li key={type} className="flex items-center gap-1.5">
              <span className="numeral text-ink-soft">{i + 1}</span>
              <TypeBadge type={type} />
            </li>
          ))}
        </ol>
        <span className="font-bold">{t("lgu.map_legend_rule")}</span>
        <span className="flex items-center gap-2 text-ink-soft">
          <span className="size-4 rounded-full border-[1.5px] border-tide bg-tide/15" aria-hidden="true" />
          {t("lgu.map_halo")}
        </span>
        <span className="flex items-center gap-2 text-ink-soft">
          <span className="size-4 rounded-full border-[1.5px] border-dashed border-tide" aria-hidden="true" />
          {t("lgu.map_halo_unknown")}
        </span>
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">{t("lgu.map_centroids")}</p>
    </section>
  );
}

function MapButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="press flex size-11 items-center justify-center rounded-sm bg-foam text-ink shadow-[0_2px_8px_rgb(13_46_66/0.18)] transition-colors duration-150 hover:bg-mist"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
