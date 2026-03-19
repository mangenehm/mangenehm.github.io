import { MODELS, getModelsForMode } from "./models.js";
import { generate } from "./api.js";

// ── State ────────────────────────────────────────────────────────────────────
let currentTab = "t2i";
let i2iImageBase64 = null;
let lastResultUrl = null;
const sessionHistory = [];

// ── DOM References ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const apiKeyModal = $("apiKeyModal");
const modalApiKeyInput = $("modalApiKeyInput");
const modalSaveKeyBtn = $("modalSaveKeyBtn");

const headerStatusDot = $("headerStatusDot");
const settingsStatusDot = $("settingsStatusDot");
const settingsKeyLabel = $("settingsKeyLabel");

const openSettingsBtn = $("openSettingsBtn");
const closeSettingsBtn = $("closeSettingsBtn");
const settingsPanel = $("settingsPanel");
const settingsApiKeyInput = $("settingsApiKeyInput");
const settingsSaveKeyBtn = $("settingsSaveKeyBtn");
const settingsDeleteKeyBtn = $("settingsDeleteKeyBtn");
const defaultResolution = $("defaultResolution");

const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

const t2iModel = $("t2iModel");
const t2iResolution = $("t2iResolution");
const t2iStepsGroup = $("t2iStepsGroup");
const t2iCfgGroup = $("t2iCfgGroup");
const t2iSteps = $("t2iSteps");
const t2iCfg = $("t2iCfg");
const t2iStepsVal = $("t2iStepsVal");
const t2iCfgVal = $("t2iCfgVal");
const t2iGenerateBtn = $("t2iGenerateBtn");

const i2iModel = $("i2iModel");
const i2iResolution = $("i2iResolution");
const i2iStepsGroup = $("i2iStepsGroup");
const i2iCfgGroup = $("i2iCfgGroup");
const i2iSteps = $("i2iSteps");
const i2iCfg = $("i2iCfg");
const i2iStepsVal = $("i2iStepsVal");
const i2iCfgVal = $("i2iCfgVal");
const i2iStrength = $("i2iStrength");
const i2iStrengthVal = $("i2iStrengthVal");
const i2iGenerateBtn = $("i2iGenerateBtn");

const dropZone = $("dropZone");
const i2iFileInput = $("i2iFileInput");
const i2iPreview = $("i2iPreview");
const i2iPreviewImg = $("i2iPreviewImg");
const i2iClearBtn = $("i2iClearBtn");

const spinner = $("spinner");
const errorBox = $("errorBox");
const resultWrap = $("resultWrap");
const resultImg = $("resultImg");
const downloadBtn = $("downloadBtn");
const useAsInputBtn = $("useAsInputBtn");
const historyThumbs = $("historyThumbs");

// ── API Key ───────────────────────────────────────────────────────────────────
function getKey() {
  return localStorage.getItem("or_api_key") || "";
}

function saveKey(key) {
  if (key) {
    localStorage.setItem("or_api_key", key.trim());
  } else {
    localStorage.removeItem("or_api_key");
  }
  updateKeyStatus();
}

function updateKeyStatus() {
  const key = getKey();
  const hasKey = key.length > 0;

  headerStatusDot.classList.toggle("active", hasKey);
  settingsStatusDot.classList.toggle("active", hasKey);
  settingsKeyLabel.textContent = hasKey
    ? `Key gesetzt (${key.slice(0, 8)}…)`
    : "Kein Key gesetzt";

  if (hasKey) {
    apiKeyModal.classList.remove("active");
  } else {
    apiKeyModal.classList.add("active");
  }
}

// Password toggle visibility
document.querySelectorAll(".password-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const targetId = btn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    btn.textContent = input.type === "password" ? "👁" : "🙈";
  });
});

// Modal save
modalSaveKeyBtn.addEventListener("click", () => {
  const val = modalApiKeyInput.value.trim();
  if (!val) return;
  saveKey(val);
  modalApiKeyInput.value = "";
});
modalApiKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") modalSaveKeyBtn.click();
});

// Settings panel
openSettingsBtn.addEventListener("click", () => settingsPanel.classList.toggle("active"));
closeSettingsBtn.addEventListener("click", () => settingsPanel.classList.remove("active"));

settingsSaveKeyBtn.addEventListener("click", () => {
  const val = settingsApiKeyInput.value.trim();
  if (!val) return;
  saveKey(val);
  settingsApiKeyInput.value = "";
});
settingsDeleteKeyBtn.addEventListener("click", () => {
  saveKey("");
  settingsApiKeyInput.value = "";
});

// Default resolution persistence
defaultResolution.value = localStorage.getItem("default_resolution") || "1024x1024";
defaultResolution.addEventListener("change", () => {
  localStorage.setItem("default_resolution", defaultResolution.value);
});

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    currentTab = tab;

    tabBtns.forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
      b.setAttribute("aria-selected", b.dataset.tab === tab);
    });
    tabContents.forEach((c) => {
      c.classList.toggle("active", c.id === `tab-${tab}`);
    });

    clearResult();
  });
});

// ── Models ────────────────────────────────────────────────────────────────────
function populateModelSelect(selectEl, mode) {
  const models = getModelsForMode(mode);
  selectEl.innerHTML = "";
  models.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.provider})`;
    selectEl.appendChild(opt);
  });

  const savedModel = localStorage.getItem(`default_model_${mode}`);
  if (savedModel && models.find((m) => m.id === savedModel)) {
    selectEl.value = savedModel;
  }
  updateModelParams(selectEl, mode);
}

function getSelectedModel(selectEl) {
  return MODELS.find((m) => m.id === selectEl.value);
}

function updateModelParams(selectEl, mode) {
  const model = getSelectedModel(selectEl);
  if (!model) return;

  localStorage.setItem(`default_model_${mode}`, model.id);

  // Update resolution options
  const resEl = mode === "t2i" ? t2iResolution : i2iResolution;
  const savedRes = localStorage.getItem("default_resolution") || "1024x1024";
  resEl.innerHTML = "";
  model.resolutions.forEach((r) => {
    const opt = document.createElement("option");
    opt.value = r;
    const [w, h] = r.split("x");
    opt.textContent = `${w} × ${h}`;
    resEl.appendChild(opt);
  });
  if (model.resolutions.includes(savedRes)) {
    resEl.value = savedRes;
  }

  // Show/hide advanced params
  if (mode === "t2i") {
    t2iStepsGroup.style.display = model.supportsSteps ? "" : "none";
    t2iCfgGroup.style.display = model.supportsCfg ? "" : "none";
  } else {
    i2iStepsGroup.style.display = model.supportsSteps ? "" : "none";
    i2iCfgGroup.style.display = model.supportsCfg ? "" : "none";
  }
}

t2iModel.addEventListener("change", () => updateModelParams(t2iModel, "t2i"));
i2iModel.addEventListener("change", () => updateModelParams(i2iModel, "i2i"));

populateModelSelect(t2iModel, "text-to-image");
populateModelSelect(i2iModel, "image-to-image");

// ── Sliders ───────────────────────────────────────────────────────────────────
function bindSlider(slider, labelEl, decimals = 0) {
  const update = () => {
    labelEl.textContent = parseFloat(slider.value).toFixed(decimals);
  };
  slider.addEventListener("input", update);
  update();
}

bindSlider(t2iSteps, t2iStepsVal);
bindSlider(t2iCfg, t2iCfgVal, 1);
bindSlider(i2iSteps, i2iStepsVal);
bindSlider(i2iCfg, i2iCfgVal, 1);
bindSlider(i2iStrength, i2iStrengthVal, 2);

// ── File Upload (I2I) ─────────────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  if (file.size > 10 * 1024 * 1024) {
    showError("Das Bild ist zu groß. Bitte wähle ein Bild unter 10 MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    i2iImageBase64 = dataUrl.split(",")[1];
    i2iPreviewImg.src = dataUrl;
    i2iPreview.classList.add("active");
  };
  reader.readAsDataURL(file);
}

i2iFileInput.addEventListener("change", (e) => handleImageFile(e.target.files[0]));

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  handleImageFile(e.dataTransfer.files[0]);
});

i2iClearBtn.addEventListener("click", () => {
  i2iImageBase64 = null;
  i2iPreviewImg.src = "";
  i2iPreview.classList.remove("active");
  i2iFileInput.value = "";
});

// ── Result Display ────────────────────────────────────────────────────────────
function clearResult() {
  spinner.classList.remove("active");
  errorBox.classList.remove("active");
  resultWrap.classList.remove("active");
  resultImg.src = "";
  lastResultUrl = null;
}

function showError(msg) {
  spinner.classList.remove("active");
  errorBox.textContent = msg;
  errorBox.classList.add("active");
  resultWrap.classList.remove("active");
}

function showResult(url) {
  spinner.classList.remove("active");
  errorBox.classList.remove("active");
  resultImg.src = url;
  resultWrap.classList.add("active");
  lastResultUrl = url;
  addToHistory(url);
}

function addToHistory(url) {
  if (sessionHistory.length >= 10) {
    sessionHistory.shift();
    historyThumbs.removeChild(historyThumbs.firstChild);
  }
  sessionHistory.push(url);

  const thumb = document.createElement("div");
  thumb.className = "history-thumb";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "Verlaufsbild";
  thumb.appendChild(img);
  thumb.addEventListener("click", () => showResult(url));
  historyThumbs.appendChild(thumb);
}

// ── Download ──────────────────────────────────────────────────────────────────
downloadBtn.addEventListener("click", async () => {
  if (!lastResultUrl) return;

  try {
    let blob;
    if (lastResultUrl.startsWith("data:")) {
      const res = await fetch(lastResultUrl);
      blob = await res.blob();
    } else {
      const res = await fetch(lastResultUrl);
      blob = await res.blob();
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bild_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    showError("Download fehlgeschlagen. Bitte Bild manuell speichern.");
  }
});

// ── Use as Input ──────────────────────────────────────────────────────────────
useAsInputBtn.addEventListener("click", async () => {
  if (!lastResultUrl) return;

  try {
    let base64;
    if (lastResultUrl.startsWith("data:")) {
      base64 = lastResultUrl.split(",")[1];
    } else {
      const res = await fetch(lastResultUrl);
      const blob = await res.blob();
      base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });
    }

    i2iImageBase64 = base64;
    i2iPreviewImg.src = lastResultUrl.startsWith("data:")
      ? lastResultUrl
      : `data:image/png;base64,${base64}`;
    i2iPreview.classList.add("active");

    // Switch to I2I tab
    document.querySelector('[data-tab="i2i"]').click();
  } catch {
    showError("Bild konnte nicht als Eingangsbild geladen werden.");
  }
});

// ── Generate ──────────────────────────────────────────────────────────────────
async function runGenerate(mode) {
  if (!getKey()) {
    apiKeyModal.classList.add("active");
    return;
  }

  const isT2I = mode === "t2i";
  const promptEl = isT2I ? $("t2iPrompt") : $("i2iPrompt");
  const negPromptEl = isT2I ? $("t2iNegPrompt") : $("i2iNegPrompt");
  const modelSelectEl = isT2I ? t2iModel : i2iModel;
  const resolutionEl = isT2I ? t2iResolution : i2iResolution;
  const stepsEl = isT2I ? t2iSteps : i2iSteps;
  const cfgEl = isT2I ? t2iCfg : i2iCfg;
  const seedEl = isT2I ? $("t2iSeed") : $("i2iSeed");
  const generateBtn = isT2I ? t2iGenerateBtn : i2iGenerateBtn;

  const prompt = promptEl.value.trim();
  if (!prompt) {
    showError("Bitte gib einen Prompt ein.");
    promptEl.focus();
    return;
  }

  if (!isT2I && !i2iImageBase64) {
    showError("Bitte lade zuerst ein Eingangsbild hoch.");
    return;
  }

  const model = getSelectedModel(modelSelectEl);
  if (!model) {
    showError("Kein Modell ausgewählt.");
    return;
  }

  const [width, height] = resolutionEl.value.split("x").map(Number);
  const params = {
    width,
    height,
    steps: model.supportsSteps ? parseInt(stepsEl.value, 10) : undefined,
    cfg: model.supportsCfg ? parseFloat(cfgEl.value) : undefined,
    seed: seedEl.value ? parseInt(seedEl.value, 10) : undefined,
    strength: !isT2I ? parseFloat(i2iStrength.value) : undefined,
  };

  clearResult();
  spinner.classList.add("active");
  generateBtn.disabled = true;

  try {
    const result = await generate({
      mode: isT2I ? "text-to-image" : "image-to-image",
      model,
      prompt,
      negativePrompt: negPromptEl.value.trim() || undefined,
      imageBase64: !isT2I ? i2iImageBase64 : undefined,
      params,
    });
    showResult(result.url);
  } catch (err) {
    showError(err.message || "Unbekannter Fehler beim Generieren.");
  } finally {
    generateBtn.disabled = false;
  }
}

t2iGenerateBtn.addEventListener("click", () => runGenerate("t2i"));
i2iGenerateBtn.addEventListener("click", () => runGenerate("i2i"));

// ── Keyboard Shortcut: Ctrl+Enter ─────────────────────────────────────────────
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runGenerate(currentTab);
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
updateKeyStatus();
