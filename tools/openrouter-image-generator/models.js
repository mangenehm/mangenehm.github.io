export const MODELS = [
  {
    id: "black-forest-labs/flux-1.1-pro",
    name: "FLUX 1.1 Pro",
    provider: "Black Forest Labs",
    supports: ["text-to-image"],
    maxResolution: "1440x1440",
    resolutions: ["512x512", "768x768", "1024x1024", "1280x1280", "1440x1440"],
    supportsSteps: false,
    supportsCfg: false,
  },
  {
    id: "black-forest-labs/flux-1-schnell",
    name: "FLUX Schnell",
    provider: "Black Forest Labs",
    supports: ["text-to-image"],
    maxResolution: "1024x1024",
    resolutions: ["512x512", "768x768", "1024x1024"],
    supportsSteps: true,
    supportsCfg: false,
  },
  {
    id: "stabilityai/stable-diffusion-xl-base-1.0",
    name: "SDXL Base 1.0",
    provider: "Stability AI",
    supports: ["text-to-image", "image-to-image"],
    maxResolution: "1024x1024",
    resolutions: ["512x512", "768x768", "1024x1024"],
    supportsSteps: true,
    supportsCfg: true,
  },
  {
    id: "stabilityai/stable-diffusion-3-medium",
    name: "SD3 Medium",
    provider: "Stability AI",
    supports: ["text-to-image", "image-to-image"],
    maxResolution: "1024x1024",
    resolutions: ["512x512", "768x768", "1024x1024"],
    supportsSteps: true,
    supportsCfg: true,
  },
];

export function getModelsForMode(mode) {
  return MODELS.filter((m) => m.supports.includes(mode));
}
