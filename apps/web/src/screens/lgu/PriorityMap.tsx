// SPEC: 10 — need hotspots by settlement cluster (replaces the spec 09 barangay beacons).
// One circle per cluster centre: radius by people, shade by need points, red ring = no safe water within 30 min.
// The top 10 by current rank get numbered, labelled markers; rank 1 ripples. Optional truck-route overlay.
import L from "leaflet";
import { useMemo } from "react";
import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import { useCopy } from "../../copy/i18n";
import { DEPOT } from "../../contracts/spec10";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import type { DropStop } from "../../lib/need";
import { Icon } from "../../ui/Icon";
import { HEX, LABEL_OFFSET, MapShell, circleRadius, labelSide, needFill, svg } from "./mapKit";

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const TOP_N = 10; // SPEC: 10 — only the top 10 get numbered markers

export interface MapRow {
  cluster_id: string;
  label: string;
  lat: number;
  lng: number;
  people: number;
  need_points: number;
  no_safe_access: boolean;
  rank: number; // current rank in the officer's order
  reasons: string[];
}

export interface TruckOverlay {
  show: boolean;
  stops: DropStop[];
  path: [number, number][] | null; // road route [lat, lng]; null = straight dashed lines
}

const fmt = (n: number) => n.toLocaleString("en-US");

// Leaflet pins take an HTML string, built by hand so the bundle doesn't need react-dom/server.
function beaconIcon(rank: number, active: boolean) {
  const top = rank === 1;
  const size = top ? 50 : 38;
  const ring = active ? "outline-[3px] outline-offset-2 outline-ink" : "";
  const ripple = top ? `<span class="beacon-ring" style="color:${HEX.tide}"></span><span class="beacon-ring" style="color:${HEX.tide}"></span>` : "";
  const html =
    `<span class="relative block" style="width:${size}px;height:${size}px">${ripple}` +
    `<span class="relative flex h-full w-full items-center justify-center rounded-full border-[3px] border-foam bg-ink font-display text-foam shadow-[0_4px_10px_rgb(13_46_66/0.28)] ${ring} ${top ? "text-[21px]" : "text-[16px]"}">${rank}</span></span>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function truckIcon(order: number) {
  const html =
    `<span class="relative flex h-9 items-center justify-center gap-1 rounded-md border-2 border-foam bg-amber px-2 font-display text-[15px] text-foam shadow-[0_3px_8px_rgb(13_46_66/0.3)]">${svg("truck", 16)}${order}</span>`;
  return L.divIcon({ html, className: "", iconSize: [54, 36], iconAnchor: [27, 18] });
}

function depotIcon() {
  const html =
    `<span class="flex size-9 items-center justify-center rounded-md border-2 border-foam bg-ink text-foam shadow-[0_3px_8px_rgb(13_46_66/0.3)]">${svg("building", 18)}</span>`;
  return L.divIcon({ html, className: "", iconSize: [36, 36], iconAnchor: [18, 18] });
}

export function PriorityMap({ rows, truck, active, onActive, onSelect }: {
  rows: MapRow[]; // in the officer's current order, rank 1 first
  truck: TruckOverlay;
  active: string | null;
  onActive: (clusterId: string | null) => void;
  onSelect: (clusterId: string) => void;
}) {
  const { t } = useCopy();
  const maxPeople = Math.max(0, ...rows.map((r) => r.people));
  const maxNeed = Math.max(0, ...rows.map((r) => r.need_points));
  const top = rows.slice(0, TOP_N);
  const first = rows[0];
  const bySize = useMemo(() => [...rows].sort((a, b) => b.people - a.people), [rows]); // small circles drawn last, on top
  const pinLabel = (r: MapRow) => t("lgu.cluster_pin_label", { name: r.label, rank: r.rank, people: fmt(r.people) });

  const straight: [number, number][] = [[DEPOT.lat, DEPOT.lng], ...truck.stops.map((s): [number, number] => [s.lat, s.lng])];

  return (
    <section className="mt-4" aria-label={t("lgu.map_title")}>
      <MapShell
        ariaLabel={t("lgu.map_title")}
        overlay={
          <>
            {first && (
              <div className="pointer-events-none absolute left-3 top-3 z-[1000] hidden w-[264px] rounded-lg bg-ink p-4 text-foam shadow-[0_8px_24px_rgb(13_46_66/0.3)] sm:block">
                <p className="flex items-center gap-3">
                  <span className="numeral flex size-11 shrink-0 items-center justify-center rounded-md bg-foam text-[26px] text-ink">1</span>
                  <span className="min-w-0">
                    <span className="block font-display text-[20px] leading-tight">{first.label}</span>
                    <span className="block text-[14px] font-bold text-sky">{t("lgu.map_served_first")}</span>
                  </span>
                </p>
                <p className="mt-3 text-[14px] font-bold">{fmt(first.people)} people (estimate)</p>
                <p className="mt-1 text-[14px] leading-snug text-sky">{first.reasons.slice(1, 4).join(" · ")}</p>
              </div>
            )}
            <ol aria-label={t("lgu.map_strip_top")} className="absolute inset-x-3 bottom-3 z-[1000] flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {top.map((r) => {
                const on = r.cluster_id === active;
                return (
                  <li key={r.cluster_id} className="shrink-0">
                    <button
                      type="button"
                      aria-label={pinLabel(r)}
                      onClick={() => onSelect(r.cluster_id)}
                      onMouseEnter={() => onActive(r.cluster_id)}
                      onMouseLeave={() => onActive(null)}
                      onFocus={() => onActive(r.cluster_id)}
                      onBlur={() => onActive(null)}
                      className={`flex h-11 items-center gap-2 rounded-full py-1 pl-1 pr-4 text-[15px] font-bold shadow-[0_2px_8px_rgb(13_46_66/0.18)] transition-colors duration-150 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ink ${on ? "bg-ink text-foam" : "bg-foam text-ink"}`}
                    >
                      <span className="numeral flex size-9 items-center justify-center rounded-full bg-ink text-[16px] text-foam ring-2 ring-foam">{r.rank}</span>
                      {r.label}
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        }
      >
        {bySize.map((r) => {
          const on = r.cluster_id === active;
          return (
            <CircleMarker
              key={`c-${r.cluster_id}`}
              center={[r.lat, r.lng]}
              radius={circleRadius(r.people, maxPeople)}
              pathOptions={{
                color: r.no_safe_access ? HEX.coralDeep : HEX.ink,
                weight: on ? 4 : r.no_safe_access ? 3 : 1,
                opacity: on || r.no_safe_access ? 1 : 0.5,
                dashArray: r.no_safe_access ? "3 3" : undefined, // shape cue as well as colour
                fillColor: needFill(r.need_points, maxNeed),
                fillOpacity: 0.78,
              }}
              eventHandlers={{
                click: () => onSelect(r.cluster_id),
                mouseover: () => onActive(r.cluster_id),
                mouseout: () => onActive(null),
              }}
            >
              <Tooltip direction="top">{`${r.label}: ${fmt(r.people)} people, ${fmt(Math.round(r.need_points))} need pts`}</Tooltip>
            </CircleMarker>
          );
        })}

        {top.map((r) => {
          const on = r.cluster_id === active;
          const side = labelSide(r, top.filter((o) => o !== r));
          return (
            <Marker
              key={`m-${r.cluster_id}`}
              position={[r.lat, r.lng]}
              icon={beaconIcon(r.rank, on)}
              title={pinLabel(r)}
              alt={pinLabel(r)}
              zIndexOffset={on ? 2000 : r.rank === 1 ? 1000 : -r.rank}
              eventHandlers={{ click: () => onSelect(r.cluster_id), mouseover: () => onActive(r.cluster_id), mouseout: () => onActive(null) }}
            >
              <Tooltip permanent direction={side} offset={LABEL_OFFSET[side](r.rank === 1 ? 25 : 19)} className={`map-label ${r.rank === 1 ? "map-label-top" : ""}`}>
                {r.label}
              </Tooltip>
            </Marker>
          );
        })}

        {truck.show && truck.stops.length > 0 && (
          <>
            <Polyline
              positions={truck.path ?? straight}
              pathOptions={{ color: "#a5670f", weight: 4, opacity: 0.9, dashArray: truck.path ? undefined : "8 8" }}
              interactive={false}
            />
            <Marker position={[DEPOT.lat, DEPOT.lng]} icon={depotIcon()} title={`${t("lgu.truck_depot")}: ${DEPOT.name}`} alt={`${t("lgu.truck_depot")}: ${DEPOT.name}`} zIndexOffset={900}>
              <Tooltip permanent direction="bottom" offset={[0, 18]} className="map-label">{DEPOT.name}</Tooltip>
            </Marker>
            {truck.stops.map((s) => (
              <Marker
                key={`t-${s.cluster_id}`}
                position={[s.lat, s.lng]}
                icon={truckIcon(s.order)}
                title={t("lgu.truck_marker", { n: s.order, label: s.label })}
                alt={t("lgu.truck_marker", { n: s.order, label: s.label })}
                zIndexOffset={1500}
              />
            ))}
          </>
        )}
      </MapShell>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <li className="flex items-center gap-2">
          <span className="flex items-end gap-1" aria-hidden="true">
            <span className="size-3 rounded-full bg-water" /><span className="size-5 rounded-full bg-water" />
          </span>
          {t("lgu.legend_size")}
        </li>
        <li className="flex items-center gap-2">
          <span className="flex" aria-hidden="true">
            <span className="size-4 rounded-l-full" style={{ background: HEX.sky }} /><span className="size-4 rounded-r-full" style={{ background: HEX.ink }} />
          </span>
          {t("lgu.legend_shade")}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-full border-[3px] border-dashed border-coral-deep bg-mist" aria-hidden="true" />
          <Icon name="alert" size={16} className="text-coral-deep" />
          {t("lgu.legend_ring", { jmp })}
        </li>
      </ul>
      <p className="mt-1 text-[14px] text-ink-soft">{t("lgu.map_source")}</p>
      <p className="mt-1 text-[14px] text-ink-soft">{t("lgu.map_numbers")}</p>
    </section>
  );
}
