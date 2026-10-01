const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm";
const MODEL_ID = "onnx-community/Qwen3-0.6B-Instruct-ONNX";
let generatorPromise;

function progress(taskId, message) {
  self.postMessage({ type: "progress", taskId, message });
}

function stripEnvelope(value) {
  let text = String(value ?? "").trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text.trim();
}

async function getGenerator(taskId) {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      progress(taskId, "Loading local AI runtime…");
      const { pipeline } = await import(TRANSFORMERS_URL);
      const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
      progress(taskId, hasWebGpu ? "Loading local model on your GPU…" : "Loading local model on CPU/WASM…");
      return pipeline("text-generation", MODEL_ID, {
        device: hasWebGpu ? "webgpu" : "wasm",
        dtype: hasWebGpu ? "q4f16" : "q4",
        progress_callback: (event) => {
          if (event?.status === "progress" && typeof event.progress === "number") {
            progress(taskId, `Downloading local model… ${Math.round(event.progress)}%`);
          }
        },
      });
    })();
  }
  return generatorPromise;
}

self.addEventListener("message", async (event) => {
  if (event.data?.type !== "run") return;
  const task = event.data.task;
  try {
    const generator = await getGenerator(task.id);
    progress(task.id, `Running ${task.capability.replaceAll("_", " ").toLowerCase()} locally…`);
    const schema = task.responseJsonSchema ? JSON.stringify(task.responseJsonSchema) : null;
    const prompt = [
      task.systemInstruction ? `SYSTEM:\n${task.systemInstruction}` : "",
      `USER:\n${task.prompt}`,
      schema ? `Return ONLY valid JSON matching this schema. No markdown, no commentary.\nJSON SCHEMA:\n${schema}` : "Return only the requested answer.",
    ].filter(Boolean).join("\n\n");
    const output = await generator(prompt, {
      max_new_tokens: Math.min(task.maxOutputTokens, 10000),
      do_sample: false,
      return_full_text: false,
    });
    const generated = Array.isArray(output) ? output[0]?.generated_text : null;
    const text = stripEnvelope(typeof generated === "string" ? generated : "");
    if (!text) throw new Error("The local model returned an empty response.");
    self.postMessage({ type: "result", taskId: task.id, text });
  } catch (error) {
    self.postMessage({
      type: "error",
      taskId: task.id,
      message: error instanceof Error ? error.message : "Local AI failed.",
    });
  }
});
