/*
 * Zoom-Mathematik für das Brett (ohne DOM).
 * Ansicht v = { z, tx, ty }: Zoomfaktor und Verschiebung in CSS-Pixeln.
 * Ein Brettpunkt b (CSS-Pixel bei z = 1) erscheint an der Stelle b·z − t.
 */

export const MIN_Z = 1;
export const MAX_Z = 4;

/** Zoom begrenzen und so verschieben, dass kein Rand neben dem Brett sichtbar wird. */
export function clampView({ z, tx, ty }, size) {
  const zz = Math.min(MAX_Z, Math.max(MIN_Z, z));
  const max = size * zz - size;
  return { z: zz, tx: Math.min(max, Math.max(0, tx)), ty: Math.min(max, Math.max(0, ty)) };
}

/** Auf z2 zoomen; der Punkt (px, py) im Sichtfenster bleibt dabei an Ort und Stelle. */
export function zoomAt(v, size, z2, px, py) {
  const zz = Math.min(MAX_Z, Math.max(MIN_Z, z2));
  const bx = (px + v.tx) / v.z, by = (py + v.ty) / v.z;
  return clampView({ z: zz, tx: bx * zz - px, ty: by * zz - py }, size);
}

/** Sichtfenster-Pixel → Brett-Einheiten (scale = CSS-Pixel je Einheit bei z = 1). */
export function toBoard(px, py, v, scale) {
  return [(px + v.tx) / (v.z * scale), (py + v.ty) / (v.z * scale)];
}

export const sameView = (a, b) => a.z === b.z && a.tx === b.tx && a.ty === b.ty;
