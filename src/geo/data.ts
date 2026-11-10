import { norm } from './normalize';

// Offline geo data lives in public/geo (copied into the app bundle, served from the app's own origin).
//   world-countries.json   Natural Earth 1:50m countries (public domain), props: name(zh-TW) en iso2 iso3 lx ly ml
//   country-aliases.json   [iso3, zh-TW name, en name, iso2, [aliases...]] sorted by population (big countries win clashes)
//   cities.json            GeoNames cities5000 (CC BY 4.0): [name, ascii, cc, lat, lng, population, "han|han", "latin alias|..."] sorted by population

export type GeoFC = { type: 'FeatureCollection'; features: unknown[] };
export type Country = { iso3: string; name: string; en: string; iso2: string };
export type City = { name: string; cc: string; lat: number; lng: number; pop: number };

const url = (f: string) => `${import.meta.env.BASE_URL}geo/${f}`;
async function getJson<T>(f: string): Promise<T> {
  const r = await fetch(url(f));
  if (!r.ok) throw new Error(`讀取地理資料 ${f} 失敗（HTTP ${r.status}）`);
  return (await r.json()) as T;
}
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export type CountryData = { geo: GeoFC; match: (v: string) => Country | null };
let countriesP: Promise<CountryData> | null = null;
export function loadCountries(): Promise<CountryData> {
  if (!countriesP) {
    countriesP = (async () => {
      const [geo, table] = await Promise.all([
        getJson<GeoFC>('world-countries.json'),
        getJson<[string, string, string, string, string[]][]>('country-aliases.json'),
      ]);
      const map = new Map<string, Country>();
      for (const [iso3, name, en, iso2, aliases] of table) {
        const rec: Country = { iso3, name, en, iso2 };
        for (const a of aliases) {
          const k = norm(a);
          if (k && !map.has(k)) map.set(k, rec);
        }
      }
      // the WebView ships CLDR region names (zh-TW 澳洲 / 紐西蘭 / 象牙海岸 ..., en, ja): free extra aliases
      for (const rec of new Set(map.values())) {
        if (!rec.iso2) continue;
        for (const lang of ['zh-TW', 'zh-CN', 'en', 'ja']) {
          try {
            const n = new Intl.DisplayNames([lang], { type: 'region' }).of(rec.iso2);
            const k = n ? norm(n) : '';
            if (k && !map.has(k)) map.set(k, rec);
          } catch { /* region code unknown to this engine */ }
        }
      }
      const match = (v: string): Country | null => {
        const hit = map.get(norm(v));
        if (hit) return hit;
        // "Myanmar (Burma)", "Korea, South" -> try the part before the bracket / comma
        const head = v.split(/[,，(（]/)[0];
        return head !== v && head.trim() ? (map.get(norm(head)) ?? null) : null;
      };
      return { geo, match };
    })();
    countriesP.catch(() => { countriesP = null; }); // allow a retry after a failed load
  }
  return countriesP;
}

type CityRow = [string, string, string, number, number, number, string, string];
export type CityData = { match: (v: string, cc?: string) => City | null };
let citiesP: Promise<CityData> | null = null;
const TAIL = /(市|县|区|都|府|郡|city)$/;

export function loadCities(): Promise<CityData> {
  if (!citiesP) {
    citiesP = (async () => {
      const rows = await getJson<CityRow[]>('cities.json');
      await tick(); // let the "loading" state paint before the ~1s index build
      const idx = new Map<string, number[]>();
      rows.forEach((r, i) => {
        const keys = new Set<string>();
        for (const n of [r[0], r[1], ...(r[6] ? r[6].split('|') : []), ...(r[7] ? r[7].split('|') : [])]) {
          if (!n) continue;
          keys.add(norm(n));
          if (/\scity$/i.test(n)) keys.add(norm(n.replace(/\scity$/i, '')));
        }
        for (const k of keys) {
          const a = idx.get(k);
          if (a) a.push(i);
          else idx.set(k, [i]);
        }
      });
      const find = (v: string): number[] | undefined => {
        let k = norm(v);
        let c = idx.get(k);
        if (c) return c;
        const head = v.split(/[,，(（/／]/)[0];
        if (head !== v) {
          k = norm(head);
          c = idx.get(k);
          if (c) return c;
        }
        const k2 = k.replace(TAIL, '');
        return k2 && k2 !== k ? idx.get(k2) : undefined;
      };
      return {
        match: (v: string, cc?: string) => {
          const c = find(v);
          if (!c) return null;
          // rows are sorted by population, so the first hit is the biggest city of that name
          const i = cc ? c.find((j) => rows[j][2] === cc) : c[0];
          if (i === undefined) return null;
          const r = rows[i];
          return { name: r[0], cc: r[2], lat: r[3], lng: r[4], pop: r[5] };
        },
      };
    })();
    citiesP.catch(() => { citiesP = null; });
  }
  return citiesP;
}
