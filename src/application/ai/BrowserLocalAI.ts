"use client";

export type LocalAIProgress = Readonly<{
  stage: "LOADING" | "DOWNLOADING" | "GENERATING" | "GUARDING";
  message: string;
  progress?: number;
}>;

export type LocalAIResult = Readonly<{
  improvedText: string;
  model: string;
  device: "webgpu" | "wasm";
  guardianSafe: true;
}>;

type WorkerSuccess = {
  type: "SUCCESS";
  improvedText: string;
  model: string;
  device: "webgpu" | "wasm";
  guardianSafe: true;
};
type WorkerProgress = {
  type: "PROGRESS";
  stage: LocalAIProgress["stage"];
  message: string;
  progress?: number;
};
type WorkerFailure = { type: "ERROR"; code: string; message: string };

export function runLocalResumeImprovement(
  sourceText: string,
  targetText: string | null,
  onProgress?: (progress: LocalAIProgress) => void,
): Promise<LocalAIResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/cvengine-local-ai-worker.js", { type: "module" });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<WorkerSuccess | WorkerProgress | WorkerFailure>) => {
      const payload = event.data;
      if (payload.type === "PROGRESS") {
        onProgress?.({
          stage: payload.stage,
          message: payload.message,
          ...(typeof payload.progress === "number" ? { progress: payload.progress } : {}),
        });
        return;
      }
      cleanup();
      if (payload.type === "ERROR") {
        reject(new Error(payload.code));
        return;
      }
      resolve({
        improvedText: payload.improvedText,
        model: payload.model,
        device: payload.device,
        guardianSafe: true,
      });
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error("LOCAL_AI_WORKER_FAILED"));
    };
    worker.postMessage({ type: "IMPROVE", sourceText, targetText });
  });
}
