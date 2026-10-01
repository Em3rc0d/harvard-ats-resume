const WEBLLM_URL = "https://esm.run/@mlc-ai/web-llm@0.2.85";
const MODEL_LADDER = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", vramMB: 1629.75 },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", vramMB: 879.04 },
];
const FIRST_TOKEN_TIMEOUT_MS = 45_000;
const STAGE_TIMEOUT_MS = 90_000;

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
    protocol: "cvengine-local-ai-check-v3",
    timestamp: new Date().toISOString(),
    url: location.href,
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    webgpuExposed: "gpu" in navigator,
    adapterAvailable: false,
    adapterInfo: null,
    adapterProbeAttempts: [],
    attemptedModels: [],
    loadedModel: null,
    loadMs: null,
    gpuVendor: null,
    maxStorageBufferBindingSize: null,
    stages: [],
    pass: false,
    error: null,
    unhandledRejections: [],
  },
};

function renderReport() { els.report.textContent = JSON.stringify(state.report, null, 2); }
function setStatus(text, kind = "info") { els.status.textContent = text; els.status.dataset.kind = kind; }
function safeError(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try { return JSON.stringify(error); } catch { return String(error); }
}

window.addEventListener("unhandledrejection", (event) => {
  state.report.unhandledRejections.push(safeError(event.reason));
  renderReport();
});
window.addEventListener("error", (event) => {
  if (event.error) state.report.unhandledRejections.push(safeError(event.error));
  renderReport();
});

async function probeAdapter() {
  if (!("gpu" in navigator)) return null;
  const variants = [
    { label: "high-performance", options: { powerPreference: "high-performance" } },
    { label: "default", options: undefined },
  ];
  for (const variant of variants) {
    const attempt = { label: variant.label, returnedAdapter: false, error: null };
    state.report.adapterProbeAttempts.push(attempt);
    try {
      const adapter = await navigator.gpu.requestAdapter(variant.options);
      attempt.returnedAdapter = Boolean(adapter);
      if (!adapter) continue;
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
    } catch (error) {
      attempt.error = safeError(error);
    }
  }
  renderReport();
  return null;
}

async function loadEngine() {
  const webllm = await import(WEBLLM_URL);
  let lastError = null;
  for (const candidate of MODEL_LADDER) {
    const attempt = { model: candidate.id, advertisedVramMB: candidate.vramMB, status: "loading", error: null };
    state.report.attemptedModels.push(attempt);
    renderReport();
    setStatus(`Loading ${candidate.label} on your GPU…`);
    const worker = new Worker("/local-ai-check-worker-v3.js", { type: "module" });
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
      attempt.error = safeError(error);
      lastError = error;
      worker.terminate();
      renderReport();
    }
  }
  throw lastError ?? new Error("No allowlisted local model could be loaded.");
}

async function streamStage(engine, spec) {
  const stage = {
    name: spec.name,
    status: "running",
    ttftMs: null,
    totalMs: null,
    output: "",
    usage: null,
    runtimeStats: null,
    validation: null,
    error: null,
  };
  state.report.stages.push(stage);
  renderReport();
  setStatus(spec.statusText);

  const started = performance.now();
  let iterator = null;
  let firstTokenTimer = null;
  let stageTimer = null;
  let firstTokenSeen = false;
  let timedOut = false;

  const timeoutPromise = new Promise((_, reject) => {
    firstTokenTimer = setTimeout(() => {
      if (!firstTokenSeen) {
        timedOut = true;
        try { engine.interruptGenerate(); } catch {}
        reject(new Error(`No first token after ${FIRST_TOKEN_TIMEOUT_MS / 1000}s`));
      }
    }, FIRST_TOKEN_TIMEOUT_MS);
    stageTimer = setTimeout(() => {
      timedOut = true;
      try { engine.interruptGenerate(); } catch {}
      reject(new Error(`Stage exceeded ${STAGE_TIMEOUT_MS / 1000}s`));
    }, STAGE_TIMEOUT_MS);
  });

  const generationPromise = (async () => {
    const chunks = await engine.chat.completions.create({
      ...spec.request,
      stream: true,
      stream_options: { include_usage: true },
      extra_body: {
        ...(spec.request.extra_body ?? {}),
        enable_latency_breakdown: true,
      },
    });
    iterator = chunks[Symbol.asyncIterator]();
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      const chunk = next.value;
      const delta = chunk?.choices?.[0]?.delta?.content ?? "";
      if (delta && !firstTokenSeen) {
        firstTokenSeen = true;
        stage.ttftMs = Math.round(performance.now() - started);
        if (firstTokenTimer) clearTimeout(firstTokenTimer);
      }
      if (delta) {
        stage.output += delta;
        els.result.textContent = stage.output;
        renderReport();
      }
      if (chunk?.usage) stage.usage = chunk.usage;
    }
    stage.totalMs = Math.round(performance.now() - started);
    try { stage.runtimeStats = await engine.runtimeStatsText(); } catch {}
    stage.validation = spec.validate(stage.output);
    stage.status = stage.validation.ok ? "pass" : "fail";
    renderReport();
    return stage;
  })();

  try {
    const result = await Promise.race([generationPromise, timeoutPromise]);
    return result;
  } catch (error) {
    stage.status = timedOut ? "timeout" : "error";
    stage.error = safeError(error);
    stage.totalMs = Math.round(performance.now() - started);
    try { await iterator?.return?.(); } catch {}
    try { stage.runtimeStats = await engine.runtimeStatsText(); } catch {}
    renderReport();
    return stage;
  } finally {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    if (stageTimer) clearTimeout(stageTimer);
    try { await engine.resetChat(true); } catch {}
  }
}

function validateExactOK(text) {
  const normalized = text.trim().replace(/^['"]|['"]$/g, "").trim().toUpperCase();
  return { ok: normalized === "OK", normalized };
}

function validateStructured(text) {
  try {
    const parsed = JSON.parse(text);
    const expected = ["identity", "experience", "skills"];
    const ok = parsed?.locale === "es" &&
      Array.isArray(parsed?.units) && parsed.units.length === 3 &&
      parsed.units.every((item, index) => item?.ordinal === index + 1 && item?.section === expected[index]);
    return { ok, parsed };
  } catch (error) {
    return { ok: false, parseError: safeError(error) };
  }
}

async function run() {
  els.run.disabled = true;
  els.copy.disabled = true;
  els.result.textContent = "";
  els.progress.textContent = "";
  state.report.error = null;
  state.report.pass = false;
  state.report.stages = [];
  state.report.unhandledRejections = [];
  renderReport();

  let engine = null;
  let worker = null;
  try {
    if (!window.isSecureContext) throw new Error("This page is not a secure context. WebGPU requires HTTPS.");
    if (!("gpu" in navigator)) throw new Error("WebGPU is not exposed by this browser.");
    const adapter = await probeAdapter();
    if (!adapter) {
      setStatus("WebGPU preflight returned no adapter. Trying WebLLM directly…", "warn");
    }
    ({ engine, worker } = await loadEngine());
    els.progress.textContent = "Model loaded. Starting staged inference probes…";

    const baseline = await streamStage(engine, {
      name: "baseline-text",
      statusText: "Model loaded. Testing first-token latency…",
      request: {
        messages: [
          { role: "system", content: "Follow the instruction exactly. No explanation." },
          { role: "user", content: "Reply with exactly: OK" },
        ],
        temperature: 0,
        seed: 0,
        max_tokens: 8,
      },
      validate: validateExactOK,
    });

    if (baseline.status !== "pass") {
      setStatus("FAIL — model loaded, but baseline generation is not healthy on this device.", "error");
      return;
    }

    const schema = JSON.stringify({
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
    });

    const structured = await streamStage(engine, {
      name: "json-schema-classification",
      statusText: "Baseline passed. Testing constrained CV JSON…",
      request: {
        messages: [
          { role: "system", content: "Classify resume lines. Do not rewrite. Return only valid JSON matching the schema." },
          { role: "user", content: [
            "1 | Eduardo Merino — Full Stack AI Developer",
            "2 | Diseñé APIs y plataformas empresariales end-to-end.",
            "3 | Skills: Java, Spring Boot, TypeScript, PostgreSQL",
          ].join("\n") },
        ],
        temperature: 0,
        seed: 0,
        max_tokens: 96,
        response_format: { type: "json_object", schema },
      },
      validate: validateStructured,
    });

    state.report.pass = structured.status === "pass";
    if (state.report.pass) {
      setStatus("PASS — WebGPU, local generation, and constrained CV JSON all work on this device.", "success");
    } else {
      setStatus("PARTIAL — local generation works, but constrained JSON needs adjustment.", "warn");
    }
  } catch (error) {
    state.report.error = safeError(error);
    setStatus(`FAIL — ${state.report.error}`, "error");
  } finally {
    renderReport();
    if (engine) { try { await engine.unload(); } catch {} }
    if (worker) worker.terminate();
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
