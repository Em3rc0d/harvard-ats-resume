"use client";

export type LocalAIRuntimeCapability = Readonly<{
  webGpu: boolean;
  wasm: boolean;
  recommended: boolean;
  summary: string;
}>;

export function detectLocalAIRuntime(): LocalAIRuntimeCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { webGpu: false, wasm: false, recommended: false, summary: "Browser capability check unavailable." };
  }

  const webGpu = "gpu" in navigator;
  const wasm = typeof WebAssembly !== "undefined";
  if (webGpu) return { webGpu, wasm, recommended: true, summary: "WebGPU available. Local AI can use your device GPU." };
  if (wasm) return { webGpu, wasm, recommended: false, summary: "WebGPU is unavailable. Local AI can fall back to CPU/WASM and may be slower." };
  return { webGpu, wasm, recommended: false, summary: "This browser cannot run the local AI runtime." };
}
