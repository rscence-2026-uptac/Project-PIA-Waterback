// All 57 barangays of Catbalogan City, official names per the PSA PSGC (via PhilAtlas,
// https://www.philatlas.com/visayas/r08/samar/catbalogan.html, checked 2026-10-06).
// `served` = one of the 26 barangays CWD serves (CWD 2022 WSP p.8). Served ids match
// supabase/seed/barangays.sql (Dev A); a few seed spellings differ from the PSGC name, so those
// spellings are kept as search aliases (see docs/dev-b-handoff.md, "Barangay names").
export interface CatbaloganBarangay {
  barangay_id: string;
  name: string; // official PSGC name
  aliases: string[]; // other names residents or the WSP use; searchable
  served: boolean;
  lat: number | null;
  lng: number | null; // approximate OSM centroid (supabase/seed/barangays.sql), not survey data
}

const slug = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Approximate OSM centroids (supabase/seed/barangays.sql), keyed by barangay_id. Not survey data.
const CENTROIDS: Record<string, [number, number]> = {
  "poblacion-01": [11.7793566, 124.8809802],
  "poblacion-02": [11.7781747, 124.8818049],
  "poblacion-03": [11.7762421, 124.8797517],
  "poblacion-04": [11.7752359, 124.880791],
  "poblacion-05": [11.7744146, 124.8808816],
  "poblacion-06": [11.7733767, 124.8814669],
  "poblacion-07": [11.7735129, 124.8831998],
  "poblacion-08": [11.770344, 124.8825688],
  "poblacion-09": [11.7672978, 124.8832018],
  "poblacion-10": [11.7786172, 124.8842388],
  "poblacion-11": [11.7774794, 124.8844722],
  "poblacion-12": [11.7761342, 124.8849875],
  "poblacion-13": [11.7783032, 124.8868396],
  "san-andres": [11.7874037, 124.8971854],
  "canlapwas": [11.782208, 124.8894566],
  "san-pablo": [11.7801379, 124.8826179],
  "munoz": [11.7807436, 124.8837274],
  "mercedes": [11.782393, 124.8774376],
  "maulong": [11.7926482, 124.8660885],
  "guindapunan": [11.7716403, 124.8880985],
  "guinsorongan": [11.7581661, 124.8851083],
  "bunu-anan": [11.7540974, 124.8885802],
  "darahuway-guti": [11.7490138, 124.8721063],
  "darahuway-dako": [11.7448201, 124.876064],
  "payao": [11.8033839, 124.862532],
  "lagundi": [11.7597601, 124.9053032],
  "albalate": [11.8669069, 124.898415],
  "bagongon": [11.8031916, 124.7031307],
  "bangon": [11.8756205, 124.8784094],
  "basiao": [11.6902355, 124.9012839],
  "buluan": [11.8178079, 124.7385639],
  "cabugawan": [11.8113805, 124.8251023],
  "cagudalo": [11.8546017, 124.8778354],
  "cagusipan": [11.9053737, 124.9257881],
  "cagutian": [11.8795951, 124.9113854],
  "cagutsan": [11.8186834, 124.6833012],
  "canhawan-gote": [11.8248534, 124.7259481],
  "cawayan": [11.7979902, 124.918553],
  "cinco": [11.8234863, 124.697078],
  "estaka": [11.7963201, 124.8325568],
  "ibol": [11.7550316, 124.9014617],
  "iguid": [11.829124, 124.8370783],
  "libas": [11.8367046, 124.8883542],
  "lobo": [11.836019, 124.9181319],
  "manguehay": [11.8110047, 124.8974228],
  "mombon": [11.799764, 124.6976338],
  "new-mahayag": [11.8461719, 124.8268671],
  "old-mahayag": [11.8456606, 124.821537],
  "palanyogon": [11.8674036, 124.8657887],
  "pangdan": [11.7439792, 124.917447],
  "pupua": [11.8114369, 124.8599254],
  "rama": [11.8243674, 124.6931164],
  "san-roque": [11.8040504, 124.8389226],
  "san-vicente": [11.8655233, 124.8311909],
  "silanga": [11.8170412, 124.8399064],
  "socorro": [11.7661735, 124.8920944],
  "totoringon": [11.8537518, 124.9252225],
};

function b(name: string, opts: { id?: string; aliases?: string[]; served?: boolean } = {}): CatbaloganBarangay {
  const barangay_id = opts.id ?? slug(name);
  const c = CENTROIDS[barangay_id];
  return { barangay_id, name, aliases: opts.aliases ?? [], served: opts.served ?? false, lat: c?.[0] ?? null, lng: c?.[1] ?? null };
}

const POBLACION = Array.from({ length: 13 }, (_, i) =>
  b(`Poblacion ${i + 1} (Barangay ${i + 1})`, {
    id: `poblacion-${String(i + 1).padStart(2, "0")}`,
    aliases: [`Barangay ${i + 1}`, `Brgy ${i + 1}`, `Poblacion ${i + 1}`],
    served: true,
  }),
);

export const CATBALOGAN_BARANGAYS: CatbaloganBarangay[] = [
  ...POBLACION,
  b("Canlapwas (Poblacion)", { id: "canlapwas", aliases: ["Canlapwas"], served: true }),
  b("Muñoz (Poblacion 14)", { id: "munoz", aliases: ["Munoz", "Poblacion 14", "Barangay 14"], served: true }),
  b("San Andres", { served: true }),
  b("San Pablo", { served: true }),
  b("Mercedes", { served: true }),
  b("Maulong", { served: true }),
  b("Guindapunan", { id: "guindapunan", aliases: ["Guindaponan"], served: true }), // owner choice 2026-10-06: WSP spelling shown; PSGC "Guindaponan" kept searchable
  b("Guinsorongan", { served: true }),
  b("Bunuanan", { id: "bunu-anan", aliases: ["Bunu-anan"], served: true }),
  b("Darahuway Gote", { id: "darahuway-guti", aliases: ["Darahuway Guti"], served: true }),
  b("Darahuway Daco", { id: "darahuway-dako", aliases: ["Darahuway Dako"], served: true }),
  b("Payao", { served: true }),
  b("Lagundi", { served: true }),
  // Not served by CWD (outside the piped network: the equity layer, spec 03).
  ...[
    "Albalate", "Bagongon", "Bangon", "Basiao", "Buluan", "Cabugawan", "Cagudalo", "Cagusipan",
    "Cagutian", "Cagutsan", "Canhawan Gote", "Cawayan", "Cinco", "Estaka", "Ibol", "Iguid",
    "Libas", "Lobo", "Manguehay", "Mombon", "New Mahayag", "Old Mahayag", "Palanyogon", "Pangdan",
    "Pupua", "Rama", "San Roque", "San Vicente", "Silanga", "Socorro", "Totoringon",
  ].map((name) => b(name)),
];

/** Lowercase, no accents, no punctuation: "Muñoz (Poblacion 14)" -> "munoz poblacion 14". */
export function normalizeName(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Every word typed must start a word in the name or an alias, so "5" finds Barangay 5,
 * "dar dak" finds Darahuway Daco, and "munoz" finds Muñoz. Numbers match whole, so "1" doesn't
 * also return 10–13.
 */
export function searchBarangays(query: string): CatbaloganBarangay[] {
  const words = normalizeName(query).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const matches = CATBALOGAN_BARANGAYS.filter((brgy) =>
    [brgy.name, ...brgy.aliases].some((label) => {
      const labelWords = normalizeName(label).split(" ");
      return words.every((w) =>
        /^\d+$/.test(w) ? labelWords.includes(w) : labelWords.some((lw) => lw.startsWith(w)),
      );
    }),
  );
  return matches;
}
