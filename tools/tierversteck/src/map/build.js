/* Adresse/Ausschnitt → fertiges Brett aus echten OSM-Daten. */

import { makeProjection, fetchOsm, toFeatures, toPois } from './overpass.js';
import { rasterLayers } from './classify.js';
import { buildBoard } from './regions.js';

// Rasterauflösung: Breite des Bretts in Koordinateneinheiten (= Pixel bei der Ortsbildung)
export const BOARD_UNITS = 256;

// Ausschnittgrößen: Kantenlänge in Metern und gewünschte Anzahl Orte
export const AREAS = {
  s: { meters: 450, regions: 28, label: 'Klein (≈ 450 m)' },
  m: { meters: 650, regions: 38, label: 'Mittel (≈ 650 m)' },
  l: { meters: 900, regions: 48, label: 'Groß (≈ 900 m)' },
};

// So viel Rand (Anteil der Kantenlänge je Seite) wird mitgeladen, damit sich der Ausschnitt ohne neue Abfrage verschieben lässt
export const PAN_MARGIN = 0.2;

/** Lädt die OSM-Daten für einen Ausschnitt plus Rand. */
export async function loadArea(center, meters, { signal, onProgress } = {}) {
  const bbox = makeProjection(center, 1, meters * (1 + 2 * PAN_MARGIN)).bbox;
  const osm = await fetchOsm(bbox, { signal, onProgress });
  return { bbox, osm };
}

/** Deckt ein geladenes Gebiet den gewünschten Ausschnitt ab? */
export function covers(area, center, meters) {
  if (!area) return false;
  const b = makeProjection(center, 1, meters).bbox;
  return b.south >= area.bbox.south && b.north <= area.bbox.north && b.west >= area.bbox.west && b.east <= area.bbox.east;
}

/** Brett aus geladenen OSM-Daten berechnen (ohne Netz). */
export function boardFromOsm(osm, { center, label = '', meters, targetCount, n = BOARD_UNITS }) {
  const proj = makeProjection(center, n, meters / n);
  const features = toFeatures(osm, proj, n, meters / n, { tol: 0.3 });
  const pois = toPois(osm, proj, n);
  const { cls, barrier } = rasterLayers(features, n);
  return {
    ...buildBoard({ cls, barrier, n, targetCount, features, pois }),
    meters,
    center: { lat: +center.lat.toFixed(6), lon: +center.lon.toFixed(6) },
    label: label.slice(0, 120),
    source: 'osm',
  };
}

/** Mittelpunkt um dx/dy Meter verschieben (x nach Osten, y nach Süden). */
export function shiftCenter(center, dx, dy) {
  const cos = Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: center.lat - dy / 111320,
    lon: center.lon + dx / (111320 * cos),
  };
}
