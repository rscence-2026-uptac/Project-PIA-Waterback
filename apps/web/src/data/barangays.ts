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
}

const slug = (name: string) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function b(name: string, opts: { id?: string; aliases?: string[]; served?: boolean } = {}): CatbaloganBarangay {
  return { barangay_id: opts.id ?? slug(name), name, aliases: opts.aliases ?? [], served: opts.served ?? false };
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
  b("Guindaponan", { id: "guindapunan", aliases: ["Guindapunan"], served: true }),
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
