/* Adresse/Ausschnitt → fertiges Brett aus echten OSM-Daten. */

import { makeProjection, fetchOsm, toFeatures } from './overpass.js';
import { classifyFeatures } from './classify.js';

// So viele Zellen Rand werden mitgeladen, damit sich der Ausschnitt ohne neue Abfrage verschieben lässt
export const PAN_MARGIN = 3;

/** Lädt die OSM-Daten für einen Ausschnitt plus Rand. */
export async function loadArea(center, size, cellMeters, { signal } = {}) {
  const bbox = makeProjection(center, size + 2 * PAN_MARGIN, cellMeters).bbox;
  const osm = await fetchOsm(bbox, { signal });
  return { bbox, osm, cellMeters };
}

/** Deckt ein geladenes Gebiet den gewünschten Ausschnitt ab? */
export function covers(area, center, size, cellMeters) {
  if (!area || area.cellMeters !== cellMeters) return false;
  const b = makeProjection(center, size, cellMeters).bbox;
  return b.south >= area.bbox.south && b.north <= area.bbox.north && b.west >= area.bbox.west && b.east <= area.bbox.east;
}

/** Brett aus geladenen OSM-Daten berechnen (ohne Netz). */
export function boardFromOsm(osm, { center, label = '', size, cellMeters }) {
  const proj = makeProjection(center, size, cellMeters);
  const features = toFeatures(osm, proj, size, cellMeters);
  const terrain = classifyFeatures(features, size);
  return {
    size, terrain, features, cellMeters,
    center: { lat: +center.lat.toFixed(6), lon: +center.lon.toFixed(6) },
    label: label.slice(0, 120),
    source: 'osm',
  };
}

/** Mittelpunkt um ganze Zellen verschieben (Vorschau mit verschiebbarem Mittelpunkt). */
export function shiftCenter(center, cellMeters, dx, dy) {
  const cos = Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: center.lat - (dy * cellMeters) / 111320,
    lon: center.lon + (dx * cellMeters) / (111320 * cos),
  };
}
