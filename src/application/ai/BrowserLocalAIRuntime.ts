"use client";

export type LocalAIRuntimeCapability = Readonly<{
  webGpu: boolean;
  wasm: boolean;
  recommended: boolean;
  summary: string;
}>;

let cachedCapability: LocalAIRuntimeCapability | null = null;

export function detectLocalAIRuntime(): LocalAIRuntimeCapability {
  if (cachedCapability) return cachedCapability;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { webGpu: false, wasm: false, recommended: false, summary: "Browser capability check unavailable." };
  }

  const webGpu = "gpu" in navigator;
  const wasm = typeof WebAssembly !== "undefined";
  if (webGpu) cachedCapability = { webGpu, wasm, recommended: true, summary: "WebGPU available. Local AI can use your device GPU." };
  else if (wasm) cachedCapability = { webGpu, wasm, recommended: false, summary: "WebGPU is unavailable. Local AI can fall back to CPU/WASM and may be slower." };
  else cachedCapability = { webGpu, wasm, recommended: false, summary: "This browser cannot run the local AI runtime." };
  return cachedCapability;
}
