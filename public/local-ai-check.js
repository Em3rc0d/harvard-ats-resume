const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.84";
const MODEL_LADDER = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", vramMB: 1629.75 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", vramMB: 879.04 },
];

const els = {
  status: document.querySelector("#status"),
  progress: document.querySelector("#progress"),
  run: document.querySelector("#run"),
  copy: document.querySelector("#copy"),
  report: document.querySelector("#report"),
  result: document.querySelector("#result"),
};

const state = {
  report: {
    protocol: "cvengine-local-ai-check-v1",
    timestamp: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    webgpuExposed: "gpu" in navigator,
    adapterAvailable: false,
    adapterInfo: null,
    attemptedModels: [],
    loadedModel: null,
    loadMs: null,
    inferenceMs: null,
    gpuVendor: null,
    maxStorageBufferBindingSize: null,
    structuredJsonValid: false,
    output: null,
    error: null,
  },
};

function renderReport() {
  els.report.textContent = JSON.stringify(state.report, null, 2);
}

function setStatus(text, kind = "info") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

async function probeAdapter() {
  if (!("gpu" in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  state.report.adapterAvailable = true;
  const info = adapter.info ?? null;
  if (info) {
    state.report.adapterInfo = {
      vendor: info.vendor || null,
      architecture: info.architecture || null,
      device: info.device || null,
      description: info.description || null,
    };
  }
  renderReport();
  return adapter;
}

async function loadEngine() {
  const webllm = await import(WEBLLM_URL);
  let lastError = null;
  for (const candidate of MODEL_LADDER) {
    const attempt = { model: candidate.id, advertisedVramMB: candidate.vramMB, status: "loading", error: null };
    state.report.attemptedModels.push(attempt);
    renderReport();
    setStatus(`Loading ${candidate.label} on your GPU…`);
    const worker = new Worker("/local-ai-check-worker.js", { type: "module" });
    const started = performance.now();
    try {
      const engine = await webllm.CreateWebWorkerMLCEngine(worker, candidate.id, {
        initProgressCallback: (event) => {
          const percent = typeof event.progress === "number" ? Math.round(event.progress * 100) : null;
          els.progress.textContent = percent === null ? event.text : `${event.text} (${percent}%)`;
        },
      });
      attempt.status = "loaded";
      state.report.loadedModel = candidate.id;
      state.report.loadMs = Math.round(performance.now() - started);
      try { state.report.gpuVendor = await engine.getGPUVendor(); } catch {}
      try { state.report.maxStorageBufferBindingSize = await engine.getMaxStorageBufferBindingSize(); } catch {}
      renderReport();
      return { engine, worker };
    } catch (error) {
      attempt.status = "failed";
      attempt.error = error instanceof Error ? error.message : String(error);
      lastError = error;
      worker.terminate();
      renderReport();
    }
  }
  throw lastError ?? new Error("No allowlisted local model could be loaded.");
}

async function runStructuredProbe(engine) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      locale: { type: "string", enum: ["es"] },
      units: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            ordinal: { type: "integer", minimum: 1, maximum: 3 },
            section: { type: "string", enum: ["identity", "experience", "skills"] },
          },
          required: ["ordinal", "section"],
        },
      },
    },
    required: ["locale", "units"],
  };

  const started = performance.now();
  const response = await engine.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "Classify resume lines. Do not rewrite the text. Return only JSON matching the supplied schema.",
      },
      {
        role: "user",
        content: [
          "1 | Eduardo Merino — Full Stack AI Developer",
          "2 | Diseñé APIs y plataformas empresariales end-to-end.",
          "3 | Skills: Java, Spring Boot, TypeScript, PostgreSQL",
        ].join("\n"),
      },
    ],
    temperature: 0,
    seed: 0,
    max_tokens: 256,
    response_format: { type: "json_object", schema },
    extra_body: { enable_thinking: false },
    stream: false,
  });
  state.report.inferenceMs = Math.round(performance.now() - started);
  const text = response?.choices?.[0]?.message?.content ?? "";
  const parsed = JSON.parse(text);
  const valid = parsed?.locale === "es" &&
    Array.isArray(parsed?.units) && parsed.units.length === 3 &&
    parsed.units.every((item, index) => item?.ordinal === index + 1 && ["identity", "experience", "skills"].includes(item?.section));
  state.report.output = parsed;
  state.report.structuredJsonValid = Boolean(valid);
  renderReport();
  return parsed;
}

async function run() {
  els.run.disabled = true;
  els.copy.disabled = true;
  els.result.textContent = "";
  els.progress.textContent = "";
  state.report.error = null;
  renderReport();
  try {
    if (!window.isSecureContext) throw new Error("This page is not a secure context. WebGPU requires HTTPS.");
    if (!("gpu" in navigator)) throw new Error("WebGPU is not exposed by this browser.");
    const adapter = await probeAdapter();
    if (!adapter) throw new Error("The browser exposes WebGPU but no compatible GPU adapter was returned.");
    const { engine, worker } = await loadEngine();
    setStatus("Model loaded. Running CVEngine structured-output probe…");
    const output = await runStructuredProbe(engine);
    const ok = state.report.structuredJsonValid;
    setStatus(ok ? "PASS — browser-local AI is operational on this device." : "PARTIAL — model loaded, but structured output failed validation.", ok ? "success" : "warn");
    els.result.textContent = JSON.stringify(output, null, 2);
    try { await engine.unload(); } catch {}
    worker.terminate();
  } catch (error) {
    state.report.error = error instanceof Error ? error.message : String(error);
    setStatus(`FAIL — ${state.report.error}`, "error");
    renderReport();
  } finally {
    els.run.disabled = false;
    els.copy.disabled = false;
  }
}

els.run.addEventListener("click", () => void run());
els.copy.addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(state.report, null, 2));
  const original = els.copy.textContent;
  els.copy.textContent = "Copied";
  setTimeout(() => { els.copy.textContent = original; }, 1200);
});

void probeAdapter().catch(() => undefined);
renderReport();
