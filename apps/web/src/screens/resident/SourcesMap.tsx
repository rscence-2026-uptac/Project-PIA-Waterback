// SPEC: 05 (amendment 2026-10-06) — where the backup sources are, and which one is nearest.
// Loaded only when the resident taps "Show on map", so the Sources screen stays light on weak data.
// Pins carry the plan's letters; everything the map shows is also said in words below it.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import { useCopy } from "../../copy/i18n";
import type { BackupSource } from "../../data/mock";
import { Button, ExternalButtonLink } from "../../ui/Button";
import { Icon, PATHS } from "../../ui/Icon";

type Point = { lat: number; lng: number };
type Located = "barangay" | "asking" | "gps" | "failed";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Straight-line distance in metres (haversine). */
function metresBetween(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function letterPin(source: BackupSource, first: boolean, selected: boolean) {
  const size = selected ? 48 : 40;
  const tone = first ? "bg-tide text-foam" : "bg-sky text-ink";
  const ring = selected ? "outline-[3px] outline-offset-2 outline-ink" : "";
  const html = `<span class="flex h-full w-full items-center justify-center rounded-full border-[3px] border-foam font-display text-[19px] shadow-[0_3px_8px_rgb(13_46_66/0.3)] ${tone} ${ring}">${source.letter}</span>`;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function placePin(kind: "home" | "you") {
  const html = kind === "home"
    ? `<span class="flex h-full w-full items-center justify-center rounded-full border-[3px] border-foam bg-ink text-foam shadow-[0_3px_8px_rgb(13_46_66/0.3)]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS.home}"/></svg></span>`
    : `<span class="block h-full w-full rounded-full border-[4px] border-foam bg-water shadow-[0_0_0_6px_rgb(36_141_197/0.25)]"></span>`;
  const size = kind === "home" ? 40 : 24;
  return L.divIcon({ html, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

export function SourcesMap({ sources, home, barangayName, selectedId, onSelect }: {
  sources: BackupSource[];
  home: Point | null; // barangay centroid (approximate)
  barangayName: string;
  selectedId: string | null;
  onSelect: (sourceId: string) => void;
}) {
  const { t } = useCopy();
  const [map, setMap] = useState<L.Map | null>(null);
  const [you, setYou] = useState<Point | null>(null);
  const [located, setLocated] = useState<Located>("barangay");
  const [tilesFailed, setTilesFailed] = useState(() => !navigator.onLine);
  const reduce = useMemo(() => reduceMotion(), []);

  const mapped = sources.filter((s): s is BackupSource & Point => s.lat !== null && s.lng !== null);
  const origin = you ?? home;

  const withDistance = origin ? mapped.map((s) => ({ source: s, metres: metresBetween(origin, s) })) : [];
  const nearest = withDistance.reduce<(typeof withDistance)[number] | null>((best, d) => (!best || d.metres < best.metres ? d : best), null);
  const focus = withDistance.find((d) => d.source.source_id === selectedId) ?? nearest;

  // Keep every pin and the resident in view; there's no dragging on phones (it would trap page scroll).
  useEffect(() => {
    if (!map) return;
    const points: [number, number][] = mapped.map((s) => [s.lat, s.lng]);
    if (origin) points.push([origin.lat, origin.lng]);
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [44, 44], maxZoom: 16, animate: !reduce });
  }, [map, you, home, sources]); // eslint-disable-line react-hooks/exhaustive-deps

  function useMyLocation() {
    if (!("geolocation" in navigator)) return setLocated("failed");
    setLocated("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setYou({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocated("gps");
      },
      () => setLocated("failed"),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  const distanceText = (metres: number) =>
    metres < 1000
      ? t("sources.map_distance_m", { m: Math.max(50, Math.round(metres / 50) * 50) })
      : t("sources.map_distance_km", { km: (metres / 1000).toFixed(1) });

  if (!origin && mapped.length === 0) {
    return <p className="mt-3 rounded-xl bg-mist p-4">{t("sources.map_none")}</p>;
  }

  return (
    <section className="mt-4" aria-label={t("sources.map_label", { barangay: barangayName })}>
      <div className="pia-map relative h-[320px] overflow-hidden rounded-xl bg-mist" aria-hidden="true">
        <MapContainer
          ref={setMap}
          center={origin ? [origin.lat, origin.lng] : [mapped[0].lat, mapped[0].lng]}
          zoom={15}
          zoomControl={false}
          scrollWheelZoom={false}
          dragging={!L.Browser.mobile}
          zoomAnimation={!reduce}
          fadeAnimation={!reduce}
          markerZoomAnimation={!reduce}
          keyboard={false}
          className="h-full w-full"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            eventHandlers={{ tileerror: () => setTilesFailed(true), tileload: () => setTilesFailed(false) }}
          />
          {home && (
            <Marker position={[home.lat, home.lng]} icon={placePin("home")} interactive={false}>
              <Tooltip permanent direction="bottom" offset={[0, 22]} className="map-label">{t("sources.map_your_barangay")}</Tooltip>
            </Marker>
          )}
          {you && (
            <Marker position={[you.lat, you.lng]} icon={placePin("you")} interactive={false} zIndexOffset={500}>
              <Tooltip permanent direction="top" offset={[0, -16]} className="map-label">{t("sources.map_you")}</Tooltip>
            </Marker>
          )}
          {mapped.map((s, i) => (
            <Marker
              key={s.source_id}
              position={[s.lat, s.lng]}
              icon={letterPin(s, s.rank === 1, s.source_id === focus?.source.source_id)}
              zIndexOffset={s.source_id === focus?.source.source_id ? 1000 : -i}
              eventHandlers={{ click: () => onSelect(s.source_id) }}
            />
          ))}
        </MapContainer>

        <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2">
          <button type="button" tabIndex={-1} onClick={() => map?.zoomIn(1, { animate: !reduce })}
            className="press flex size-12 items-center justify-center rounded-sm bg-foam text-ink shadow-[0_2px_8px_rgb(13_46_66/0.2)]">
            <Icon name="plus" size={20} />
          </button>
          <button type="button" tabIndex={-1} onClick={() => map?.zoomOut(1, { animate: !reduce })}
            className="press flex size-12 items-center justify-center rounded-sm bg-foam text-ink shadow-[0_2px_8px_rgb(13_46_66/0.2)]">
            <Icon name="minus" size={20} />
          </button>
        </div>

        {tilesFailed && (
          <p className="absolute inset-x-3 bottom-3 z-[1000] rounded-lg bg-ink px-3 py-2 text-[15px] text-foam">
            {t("sources.map_offline")}
          </p>
        )}
      </div>

      {focus && (
        <div className="mt-3 rounded-xl border-2 border-tide p-4">
          <p className="text-[15px] font-bold text-tide">
            {focus === nearest ? t("sources.map_nearest", { letter: focus.source.letter }) : t("sources.plan_label", { letter: focus.source.letter })}
          </p>
          <p className="mt-1 font-display text-[22px] leading-tight">{focus.source.name}</p>
          <p className="mt-1 text-ink-soft">
            {distanceText(focus.metres)} · {located === "gps" ? t("sources.map_from_you") : t("sources.map_from_barangay")}
          </p>
          <ExternalButtonLink
            href={`https://www.google.com/maps/dir/?api=1&destination=${focus.source.lat},${focus.source.lng}&travelmode=walking`}
            icon="pin"
            className="mt-3 w-full"
          >
            {t("sources.map_directions")}
          </ExternalButtonLink>
        </div>
      )}

      {located !== "gps" && (
        <Button variant="quiet" icon="pin" className="mt-3 w-full" onClick={useMyLocation} disabled={located === "asking"}>
          {located === "asking" ? t("sources.map_locating") : t("sources.map_use_location")}
        </Button>
      )}
      {located === "failed" && <p role="status" className="mt-2 text-ink-soft">{t("sources.map_location_failed")}</p>}

    </section>
  );
}
