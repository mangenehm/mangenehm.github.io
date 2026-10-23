#!/usr/bin/env node
/*
 * Erzeugt die Grafiken einmalig über OpenRouter. Die Ergebnisse liegen danach
 * als WebP im Repo – Spieler brauchen weder Key noch Guthaben.
 *
 *   node scripts/generate-assets.mjs --list-models          Bildmodelle anzeigen
 *   node scripts/generate-assets.mjs [--model slug] [key …]  Varianten nach scripts/out/
 *   node scripts/generate-assets.mjs --pick snake=2 dog=1    Variante übernehmen
 *
 * Der API-Key steht nur lokal in .env (OPENROUTER_API_KEY=…, liegt in .gitignore).
 * Für --pick wird `sharp` gebraucht: npm i --no-save sharp
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(here, 'out');
const assetsDir = join(root, 'assets');
const API = 'https://openrouter.ai/api/v1';

async function loadEnv() {
  for (const file of [join(root, '.env'), join(root, '..', '..', '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function args() {
  const a = process.argv.slice(2);
  const opts = { model: null, list: false, pick: [], keys: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--model') opts.model = a[++i];
    else if (a[i] === '--list-models') opts.list = true;
    else if (a[i] === '--pick') { while (a[i + 1] && !a[i + 1].startsWith('--')) opts.pick.push(a[++i]); }
    else opts.keys.push(a[i]);
  }
  return opts;
}

async function listModels() {
  const res = await fetch(`${API}/models?output_modalities=image`);
  const { data } = await res.json();
  for (const m of data.filter(m => m.architecture?.output_modalities?.includes('image'))) {
    console.log(m.id.padEnd(48), m.name);
  }
  console.log('\nModell in scripts/prompts.json unter "model" eintragen oder per --model übergeben.');
}

async function generate(model, prompt, key) {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://mangenehm.github.io/tools/tierversteck/',
      'X-Title': 'Tierversteck',
    },
    body: JSON.stringify({ model, modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url?.startsWith('data:image/')) throw new Error('Keine Grafik in der Antwort');
  return Buffer.from(url.split(',')[1], 'base64');
}

/** Magenta-Hintergrund freistellen, auf Zielgröße skalieren, WebP schreiben. */
async function pick(spec, cfg) {
  let sharp;
  try { sharp = (await import('sharp')).default; }
  catch { throw new Error('Für --pick bitte zuerst `npm i --no-save sharp` ausführen.'); }
  const [key, n] = spec.split('=');
  const asset = cfg.assets[key];
  if (!asset) throw new Error(`Unbekanntes Asset: ${key}`);
  const files = (await readdir(outDir)).filter(f => f.startsWith(key + '-'));
  const file = files.find(f => f === `${key}-${n}.png`);
  if (!file) throw new Error(`${key}-${n}.png nicht gefunden (vorhanden: ${files.join(', ')})`);

  let img = sharp(join(outDir, file)).ensureAlpha();
  if (!asset.keepBackground) {
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // Magenta und seine Kantenmischungen ausblenden
      const magenta = r > 150 && b > 150 && g < 110 && Math.abs(r - b) < 70;
      if (magenta) data[i + 3] = 0;
    }
    img = sharp(data, { raw: info }).trim();
  }
  const size = asset.size || 256;
  const target = join(assetsDir, `${key}.webp`);
  await img.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 88 }).toFile(target);

  const manifestFile = join(assetsDir, 'manifest.json');
  const manifest = existsSync(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : {};
  manifest[key] = `${key}.webp`;
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ ${target}`);
}

async function main() {
  await loadEnv();
  const opts = args();
  const cfg = JSON.parse(await readFile(join(here, 'prompts.json'), 'utf8'));
  if (opts.list) return listModels();
  if (opts.pick.length) { for (const p of opts.pick) await pick(p, cfg); return; }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY fehlt (in tools/tierversteck/.env eintragen).');
  const model = opts.model || process.env.OPENROUTER_IMAGE_MODEL || cfg.model;
  if (!model) throw new Error('Kein Bildmodell gewählt – erst --list-models, dann --model <slug> oder "model" in prompts.json.');

  await mkdir(outDir, { recursive: true });
  const keys = opts.keys.length ? opts.keys : Object.keys(cfg.assets);
  for (const k of keys) {
    const asset = cfg.assets[k];
    if (!asset) { console.warn(`übersprungen: ${k}`); continue; }
    const prompt = `${asset.prompt}. ${asset.keepBackground ? cfg.style.replace(/, on a solid.*$/, '') : cfg.style}`;
    for (let v = 1; v <= (cfg.variants || 3); v++) {
      process.stdout.write(`${k} #${v} … `);
      try {
        await writeFile(join(outDir, `${k}-${v}.png`), await generate(model, prompt, key));
        console.log('ok');
      } catch (e) { console.log('Fehler: ' + e.message); }
    }
  }
  console.log(`\nVarianten liegen in ${outDir}. Beste übernehmen mit: node scripts/generate-assets.mjs --pick snake=2 …`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
