import type { Dataset, FieldMeta, Row } from '../dataset';
import { loadCities, loadCountries, type City, type Country } from './data';

// After a file is loaded, look for geography in it and add what the map charts need:
//   1. existing 經度/緯度 (lat / lng ...) columns        -> just tag them so graphic-walker draws point maps
//   2. a country column (any language / ISO code)         -> "國家(地圖)": canonical name that matches the world
//                                                           GeoJSON, used by the filled (choropleth) map
//   3. a city column (and no lat/lng yet)                 -> "經度" / "緯度" looked up in the bundled GeoNames table,
//                                                           using the country column to tell Paris, FR from Paris, US
const LAT_RE = /^(lat|latitude|緯度|纬度)$/i;
const LNG_RE = /^(lng|lon|long|longitude|經度|经度)$/i;
const COUNTRY_HINT = /country|nation|國家|国家|國別|國籍/i;
const CITY_HINT = /city|town|城市|都市|市$|鄉鎮/i;

export const COUNTRY_KEY_FIELD = '國家(地圖)';

export type GeoReport = {
  latLng?: { lat: string; lng: string };
  city?: { col: string; matched: number; total: number; missed: string[] };
  /** variants: every distinct value of the country column that matched -> iso3 (lets the raw column be used as 地理 ID) */
  country?: { col: string; matched: number; total: number; variants: [string, string][] };
  textCols: string[];
};
/** cityCol: undefined = detect automatically, null = do not geocode, string = use this column */
export type GeoOptions = { cityCol?: string | null };

function uniq(rows: Row[], fid: string, cap = 3000): string[] | null {
  const s = new Set<string>();
  for (const r of rows) {
    const v = r[fid];
    if (typeof v === 'string' && v !== '') {
      s.add(v);
      if (s.size > cap) return null; // ids / free text, not a place column
    }
  }
  return [...s];
}

function freeName(taken: Set<string>, base: string): string {
  let n = base, i = 2;
  while (taken.has(n)) n = `${base}_${i++}`;
  taken.add(n);
  return n;
}

export async function enrichGeo(
  raw: Dataset,
  opts: GeoOptions = {},
  newId?: number,
): Promise<{ ds: Dataset; report: GeoReport | null }> {
  const fields: FieldMeta[] = raw.fields.map((f) => ({ ...f }));
  const textFields = fields.filter((f) => f.semanticType === 'nominal');
  const report: GeoReport = { textCols: textFields.map((f) => f.name) };

  // 1. lat/lng that are already there
  const latF = fields.find((f) => f.semanticType === 'quantitative' && LAT_RE.test(f.name.trim()));
  const lngF = fields.find((f) => f.semanticType === 'quantitative' && LNG_RE.test(f.name.trim()));
  if (latF && lngF) {
    latF.geoRole = 'latitude';
    latF.analyticType = 'dimension';
    lngF.geoRole = 'longitude';
    lngF.analyticType = 'dimension';
    report.latLng = { lat: latF.name, lng: lngF.name };
  }

  const uniqs = new Map<string, string[] | null>();
  const uniqOf = (f: FieldMeta) => {
    if (!uniqs.has(f.fid)) uniqs.set(f.fid, uniq(raw.rows, f.fid));
    return uniqs.get(f.fid) ?? null;
  };

  // 2. country column
  const countries = await loadCountries();
  let countryF: FieldMeta | undefined;
  let countryScore = 0;
  for (const f of textFields) {
    const u = uniqOf(f);
    if (!u || u.length === 0) continue;
    const rate = u.filter((v) => countries.match(v)).length / u.length;
    const score = rate + (COUNTRY_HINT.test(f.name) ? 0.1 : 0);
    if (rate >= 0.7 && score > countryScore) {
      countryF = f;
      countryScore = score;
    }
  }

  // 3. city column -> coordinates
  const wantCity = !report.latLng && opts.cityCol !== null;
  let cityF: FieldMeta | undefined;
  let cities: Awaited<ReturnType<typeof loadCities>> | undefined;
  if (wantCity) {
    cities = await loadCities();
    if (typeof opts.cityCol === 'string') {
      cityF = textFields.find((f) => f.name === opts.cityCol);
    } else {
      let best = 0;
      for (const f of textFields) {
        if (f === countryF) continue;
        const u = uniqOf(f);
        if (!u || u.length === 0) continue;
        const rate = u.filter((v) => cities!.match(v)).length / u.length;
        const score = rate + (CITY_HINT.test(f.name) ? 0.15 : 0);
        if (rate >= 0.6 && score > best) {
          cityF = f;
          best = score;
        }
      }
    }
  }

  if (!report.latLng && !cityF && !countryF) return { ds: raw, report: null };

  const taken = new Set(fields.map((f) => f.fid));
  const cmemo = new Map<string, Country | null>();
  const countryOf = (v: unknown): Country | null => {
    if (typeof v !== 'string' || v === '') return null;
    if (!cmemo.has(v)) cmemo.set(v, countries.match(v));
    return cmemo.get(v) ?? null;
  };

  const lngName = cityF ? freeName(taken, '經度') : '';
  const latName = cityF ? freeName(taken, '緯度') : '';
  const keyName = countryF ? freeName(taken, COUNTRY_KEY_FIELD) : '';

  const gmemo = new Map<string, City | null>();
  const missed = new Set<string>();
  let cityTotal = 0, cityMatched = 0;

  const rows: Row[] = raw.rows.map((r) => {
    const out: Row = { ...r };
    const country = countryF ? countryOf(r[countryF.fid]) : null;
    if (countryF) out[keyName] = country ? country.name : null;
    if (cityF && cities) {
      const v = r[cityF.fid];
      let hit: City | null = null;
      if (typeof v === 'string' && v !== '') {
        const cc = country?.iso2 || undefined;
        const k = `${v}\u0000${cc ?? ''}`;
        if (!gmemo.has(k)) {
          hit = cities.match(v, cc);
          gmemo.set(k, hit);
          cityTotal++;
          if (hit) cityMatched++;
          else if (missed.size < 8) missed.add(v);
        } else hit = gmemo.get(k) ?? null;
      }
      out[lngName] = hit ? hit.lng : null;
      out[latName] = hit ? hit.lat : null;
    }
    return out;
  });

  if (cityF) {
    fields.push(
      { fid: lngName, name: lngName, semanticType: 'quantitative', analyticType: 'dimension', geoRole: 'longitude' },
      { fid: latName, name: latName, semanticType: 'quantitative', analyticType: 'dimension', geoRole: 'latitude' },
    );
    report.city = { col: cityF.name, matched: cityMatched, total: cityTotal, missed: [...missed] };
  }
  if (countryF) {
    fields.push({ fid: keyName, name: keyName, semanticType: 'nominal', analyticType: 'dimension' });
    const u = uniqOf(countryF) ?? [];
    const variants: [string, string][] = [];
    for (const v of u) {
      const c = countries.match(v);
      if (c) variants.push([v, c.iso3]);
    }
    report.country = { col: countryF.name, matched: variants.length, total: u.length, variants };
  }

  return { ds: { ...raw, id: newId ?? raw.id, fields, rows }, report };
}
