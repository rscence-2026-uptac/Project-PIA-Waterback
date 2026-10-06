// SPEC: 10 — access-gap map for /lgu/plan: every cluster shaded by whether people there have safe water within
// 30 min; the top 3 candidate sites are starred.
import L from "leaflet";
import { CircleMarker, Marker, Tooltip } from "react-leaflet";
import { useCopy } from "../../copy/i18n";
import { WSP_CONSTANTS } from "../../contracts/wsp";
import type { GapSite } from "../../lib/need";
import type { Cluster, NeedRow } from "../../contracts/spec10";
import { Icon } from "../../ui/Icon";
import { HEX, LABEL_OFFSET, MapShell, circleRadius, labelSide, svg } from "./mapKit";

const jmp = WSP_CONSTANTS.JMP_ROUNDTRIP_MIN;
const fmt = (n: number) => n.toLocaleString("en-US");

function starIcon(n: number) {
  const html =
    `<span class="relative flex h-10 items-center justify-center gap-1 rounded-full border-[3px] border-foam bg-ink px-2.5 font-display text-[17px] text-foam shadow-[0_4px_10px_rgb(13_46_66/0.28)]">${svg("star", 16)}${n}</span>`;
  return L.divIcon({ html, className: "", iconSize: [58, 40], iconAnchor: [29, 20] });
}

export function PlanMap({ clusters, rows, sites }: { clusters: Cluster[]; rows: NeedRow[]; sites: GapSite[] }) {
  const { t } = useCopy();
  const gap = new Map(rows.map((r) => [r.cluster_id, r.no_safe_access]));
  const maxPeople = Math.max(0, ...clusters.map((c) => c.people));
  const ordered = [...clusters].sort((a, b) => b.people - a.people);

  return (
    <section aria-label={t("plan.map_title")}>
      <MapShell ariaLabel={t("plan.map_title")}>
        {ordered.map((c) => {
          const noAccess = gap.get(c.cluster_id) ?? false;
          return (
            <CircleMarker
              key={c.cluster_id}
              center={[c.lat, c.lng]}
              radius={circleRadius(c.people, maxPeople)}
              pathOptions={noAccess
                ? { color: HEX.coralDeep, weight: 3, dashArray: "3 3", fillColor: HEX.coral, fillOpacity: 0.7 }
                : { color: HEX.tide, weight: 1, opacity: 0.4, fillColor: HEX.tide, fillOpacity: 0.12 }}
            >
              <Tooltip direction="top">{`${c.label}: ${fmt(c.people)} people${noAccess ? `, no safe water within ${jmp} min` : ""}`}</Tooltip>
            </CircleMarker>
          );
        })}
        {sites.map((s, i) => {
          const side = labelSide(s, sites.filter((o) => o !== s));
          const label = t("plan.site_marker", { n: i + 1, label: s.label, people: fmt(s.gained_people), jmp });
          return (
            <Marker key={s.cluster_id} position={[s.lat, s.lng]} icon={starIcon(i + 1)} title={label} alt={label} zIndexOffset={1000 - i}>
              <Tooltip permanent direction={side} offset={LABEL_OFFSET[side](26)} className="map-label map-label-top">{s.label}</Tooltip>
            </Marker>
          );
        })}
      </MapShell>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-full border-[3px] border-dashed border-coral-deep bg-coral" aria-hidden="true" />
          <Icon name="alert" size={16} className="text-coral-deep" />
          {t("plan.legend_gap", { jmp })}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-4 rounded-full border border-tide bg-tide/15" aria-hidden="true" />
          {t("plan.legend_ok", { jmp })}
        </li>
        <li className="flex items-center gap-2">
          <Icon name="star" size={16} />
          {t("plan.legend_site")}
        </li>
      </ul>
      <p className="mt-1 text-[14px] text-ink-soft">{t("lgu.map_source")}</p>
    </section>
  );
}
