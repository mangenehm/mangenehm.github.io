/* Text → Embedding über die OpenRouter-API (OpenAI-kompatibler Endpunkt). */
const ENDPOINT = 'https://openrouter.ai/api/v1/embeddings';

async function request(key, model, text, dimensions) {
  const body = { model, input: text };
  if (dimensions) body.dimensions = dimensions;
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('OpenRouter ist nicht erreichbar. Bitte Internetverbindung prüfen.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* leere oder ungültige Antwort */ }
  if (!res.ok || !data || data.error) {
    const msg = (data && data.error && (data.error.message || data.error)) || res.statusText || 'unbekannter Fehler';
    if (res.status === 401) throw new Error('Der API-Key wurde abgelehnt (401). Bitte den OpenRouter-Key prüfen.');
    if (res.status === 402) throw new Error('Kein Guthaben mehr bei OpenRouter (402).');
    throw new Error(`OpenRouter-Fehler (${res.status}): ${msg}`);
  }
  const emb = data.data && data.data[0] && data.data[0].embedding;
  if (!Array.isArray(emb) || !emb.length) throw new Error('OpenRouter hat kein Embedding zurückgegeben. Ist das Modell ein Embedding-Modell?');
  return emb;
}

/* Liefert ein L2-normiertes Float32Array mit der gewünschten Dimension. */
export async function embedText(key, model, text, dim) {
  let emb = await request(key, model, text);
  if (emb.length !== dim) {
    // Manche Modelle (z. B. text-embedding-3) können gekürzte Vektoren liefern.
    try { emb = await request(key, model, text, dim); } catch { /* Fehlermeldung unten */ }
  }
  if (emb.length !== dim) {
    throw new Error(`Das Modell passt nicht zu den Embeddings der CSV: Es liefert ${emb.length} Dimensionen, die CSV hat ${dim}. Bitte dasselbe Modell verwenden, mit dem die CSV erzeugt wurde.`);
  }
  const v = Float32Array.from(emb);
  let n = 0;
  for (const x of v) n += x * x;
  n = 1 / Math.sqrt(n || 1);
  for (let k = 0; k < v.length; k++) v[k] *= n;
  return v;
}
