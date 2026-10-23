/*
 * Adresse → Koordinaten über Nominatim.
 * Nutzungsrichtlinie: keine Live-Autovervollständigung, höchstens 1 Anfrage/s.
 * Gesucht wird deshalb nur beim Absenden.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
let lastRequest = 0;

const wait = ms => new Promise(r => setTimeout(r, ms));

/** Liefert bis zu 6 Treffer: [{ label, lat, lon }] */
export async function geocode(query) {
  const q = query.trim();
  if (!q) return [];
  const since = Date.now() - lastRequest;
  if (since < 1100) await wait(1100 - since);
  lastRequest = Date.now();

  const url = `${ENDPOINT}?format=jsonv2&limit=6&accept-language=de&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Adresssuche fehlgeschlagen (${res.status})`);
  const data = await res.json();
  return data.map(d => ({
    label: d.display_name,
    lat: Number(d.lat),
    lon: Number(d.lon),
  })).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lon));
}
