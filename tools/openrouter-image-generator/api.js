const API_ENDPOINT = "https://openrouter.ai/api/v1/images/generations";

/**
 * Generiert ein Bild via OpenRouter API.
 * @param {Object} options
 * @param {"text-to-image"|"image-to-image"} options.mode
 * @param {Object} options.model - Modell-Objekt aus models.js
 * @param {string} options.prompt
 * @param {string} [options.negativePrompt]
 * @param {string} [options.imageBase64] - Base64-kodiertes Eingangsbild (nur I2I)
 * @param {Object} options.params - { width, height, steps, cfg, seed, strength }
 * @returns {Promise<{url: string}>}
 */
export async function generate({ mode, model, prompt, negativePrompt, imageBase64, params }) {
  const apiKey = localStorage.getItem("or_api_key");
  if (!apiKey) {
    throw new Error("Kein API-Key gesetzt. Bitte zuerst den OpenRouter API-Key eingeben.");
  }

  const body = {
    model: model.id,
    prompt,
  };

  if (negativePrompt) {
    body.negative_prompt = negativePrompt;
  }

  if (params.width) body.width = params.width;
  if (params.height) body.height = params.height;
  if (params.steps && model.supportsSteps) body.steps = params.steps;
  if (params.cfg && model.supportsCfg) body.cfg_scale = params.cfg;
  if (params.seed) body.seed = parseInt(params.seed, 10);

  if (mode === "image-to-image" && imageBase64) {
    body.image = imageBase64;
    body.strength = params.strength ?? 0.7;
  }

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "OpenRouter Image Generator",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `HTTP-Fehler ${response.status}`;
    try {
      const err = await response.json();
      if (err.error?.message) message = err.error.message;
      else if (err.message) message = err.message;
    } catch (_) {
      // Fallback auf HTTP-Status-Nachricht
    }

    if (response.status === 401) {
      throw new Error("Ungültiger API-Key. Bitte prüfe deinen OpenRouter API-Key.");
    }
    if (response.status === 429) {
      throw new Error("Rate-Limit erreicht. Bitte warte kurz und versuche es erneut.");
    }
    if (response.status === 402) {
      throw new Error("Nicht genug Credits. Bitte lade dein OpenRouter-Konto auf.");
    }
    throw new Error(message);
  }

  const data = await response.json();

  // OpenRouter gibt { data: [{ url: "..." }] } zurück
  const imageUrl = data?.data?.[0]?.url || data?.data?.[0]?.b64_json;
  if (!imageUrl) {
    throw new Error("Keine Bilddaten in der API-Antwort gefunden.");
  }

  const isBase64 = !imageUrl.startsWith("http");
  return {
    url: isBase64 ? `data:image/png;base64,${imageUrl}` : imageUrl,
    isBase64,
  };
}
