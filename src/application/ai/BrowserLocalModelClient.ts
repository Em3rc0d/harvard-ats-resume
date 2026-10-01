"use client";

export type BrowserLocalAITask = {
  id: string;
  sequence: number;
  capability: string;
  model: string;
  prompt: string;
  systemInstruction: string | null;
  responseJsonSchema: Record<string, unknown> | null;
  maxOutputTokens: number;
};

type WorkerMessage =
  | { type: "progress"; taskId: string; message: string }
  | { type: "result"; taskId: string; text: string }
  | { type: "error"; taskId: string; message: string };

let worker: Worker | null = null;

function getWorker() {
  if (!worker) worker = new Worker("/local-ai-worker.js", { type: "module" });
  return worker;
}

export function runBrowserLocalAITask(
  task: BrowserLocalAITask,
  onProgress?: (message: string) => void,
): Promise<string> {
  const localWorker = getWorker();
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || message.taskId !== task.id) return;
      if (message.type === "progress") {
        onProgress?.(message.message);
        return;
      }
      localWorker.removeEventListener("message", onMessage);
      if (message.type === "result") resolve(message.text);
      else reject(new Error(message.message));
    };
    localWorker.addEventListener("message", onMessage);
    localWorker.postMessage({ type: "run", task });
  });
}
