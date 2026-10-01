const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0";
const MODEL_ID = "onnx-community/Qwen2.5-0.5B-Instruct";

let generatorPromise = null;
let selectedDevice = "wasm";

function progress(stage, message, value) {
  self.postMessage({ type: "PROGRESS", stage, message, ...(typeof value === "number" ? { progress: value } : {}) });
}

function generatedContent(output) {
  const text = output?.[0]?.generated_text;
  if (Array.isArray(text)) {
    const last = text.at(-1);
    return typeof last?.content === "string" ? last.content.trim() : "";
  }
  return typeof text === "string" ? text.trim() : "";
}

function numberTokens(value) {
  return new Set((value.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).map((token) => token.toLowerCase()));
}

function hasNewNumericClaims(source, improved) {
  const sourceNumbers = numberTokens(source);
  return [...numberTokens(improved)].some((token) => !sourceNumbers.has(token));
}

function extractJson(value) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
}

async function generator() {
  if (!generatorPromise) {
    generatorPromise = (async () => {
      progress("LOADING", "Preparing local AI beta…");
      const { pipeline } = await import(TRANSFORMERS_URL);
      selectedDevice = self.navigator?.gpu ? "webgpu" : "wasm";
      return pipeline("text-generation", MODEL_ID, {
        dtype: selectedDevice === "webgpu" ? "q4f16" : "int8",
        device: selectedDevice,
        progress_callback: (event) => {
          const raw = typeof event?.progress === "number" ? event.progress : null;
          progress("DOWNLOADING", "Downloading/caching the local model…", raw === null ? undefined : raw);
        },
      });
    })();
  }
  return generatorPromise;
}

async function improve(sourceText, targetText) {
  const pipe = await generator();
  progress("GENERATING", "Improving your resume on this device…");
  const editorMessages = [
    {
      role: "system",
      content: "You are CV Engine Local Editor. Rewrite a resume for clarity, concision and ATS readability. Preserve the candidate's language. Never invent employers, roles, dates, skills, technologies, metrics, responsibilities, achievements, education or credentials. A job description may change emphasis only; it is never candidate truth. Return only the complete improved resume text, no commentary."
    },
    {
      role: "user",
      content: `SOURCE CV:\n${sourceText}\n\n${targetText ? `OPTIONAL JOB DESCRIPTION (context only, never candidate truth):\n${targetText}\n\n` : ""}Rewrite the complete CV while preserving every factual claim.`
    }
  ];
  const edited = await pipe(editorMessages, { max_new_tokens: 1800, do_sample: false });
  const improvedText = generatedContent(edited);
  if (!improvedText || improvedText.length < 40) throw new Error("LOCAL_AI_EMPTY_OUTPUT");
  if (hasNewNumericClaims(sourceText, improvedText)) throw new Error("LOCAL_FACT_GUARD_REJECTED");

  progress("GUARDING", "Checking the local result against your source CV…");
  const guardMessages = [
    {
      role: "system",
      content: "You are CV Engine Local Fact Guardian. Compare GENERATED CV only to SOURCE CV. Candidate source is authoritative. Return exactly JSON: {\"safe\":true|false,\"reason\":\"short reason\"}. safe=false if generated text adds or strengthens any employer, role, date, skill, technology, metric, responsibility, achievement, education or credential not supported by SOURCE."
    },
    {
      role: "user",
      content: `SOURCE CV:\n${sourceText}\n\nGENERATED CV:\n${improvedText}`
    }
  ];
  const guarded = await pipe(guardMessages, { max_new_tokens: 160, do_sample: false });
  const verdict = extractJson(generatedContent(guarded));
  if (!verdict || verdict.safe !== true) throw new Error("LOCAL_FACT_GUARD_REJECTED");
  return improvedText;
}

self.onmessage = async (event) => {
  if (event.data?.type !== "IMPROVE") return;
  try {
    const improvedText = await improve(String(event.data.sourceText ?? ""), event.data.targetText ? String(event.data.targetText) : null);
    self.postMessage({ type: "SUCCESS", improvedText, model: MODEL_ID, device: selectedDevice, guardianSafe: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "LOCAL_AI_FAILED";
    self.postMessage({ type: "ERROR", code, message: "Local AI could not safely finish this resume." });
  }
};
