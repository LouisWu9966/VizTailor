import * as OpenCC from 'opencc-js';

// Both sides of every comparison go through the same normalisation, so 台北 / 臺北 / 台北市,
// "Sao Paulo" / "São Paulo" and "new-york" / "New York" all meet on one key.
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });
const HAN = /[\u3400-\u9fff]/;
const NOISE = /[\s.,;:'"’`()[\]{}\-_/\\·・、，。！!?？&]+/g;

export function norm(s: string): string {
  let x = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (HAN.test(x)) x = t2s(x);
  else x = x.replace(/\bst\.?\s/g, 'saint ');
  return x.replace(NOISE, '');
}
