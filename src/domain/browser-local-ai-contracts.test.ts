import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("browser-local AI access contracts", () => {
  it("does not expose platform-funded Gemini in the public AI chooser", () => {
    const panel = read("src/components/first-run/AIAccessPanel.tsx");
    expect(panel).toContain('const publicModes: AIAccessMode[] = ["BYOK_GEMINI", "NO_CLOUD_AI"]');
    expect(panel).not.toContain('publicModes: AIAccessMode[] = ["PLATFORM_GEMINI"');
    expect(panel).toContain("Google Gemini");
    expect(panel).toContain("OpenAI");
    expect(panel).toContain("Anthropic Claude");
  });

  it("runs browser-local inference in a Web Worker instead of a server AI route", () => {
    const client = read("src/application/ai/BrowserLocalAI.ts");
    const worker = read("public/cvengine-local-ai-worker.js");
    const route = read("src/app/api/resume-improvements/route.ts");
    expect(client).toContain('new Worker("/cvengine-local-ai-worker.js"');
    expect(worker).toContain("@huggingface/transformers@4.3.0");
    expect(worker).toContain("onnx-community/Qwen2.5-0.5B-Instruct");
    expect(worker).toContain('device: selectedDevice');
    expect(route).toContain("V12_LOCAL_AI_REQUIRES_BROWSER");
  });

  it("keeps local server work deterministic: extraction and artifact rendering only", () => {
    const extract = read("src/app/api/resume-local/extract/route.ts");
    const artifact = read("src/app/api/resume-local/artifact/route.ts");
    expect(extract).toContain("extractResumeMechanically");
    expect(artifact).toContain("renderV12ResumeDocx");
    expect(artifact).toContain("renderV12ResumePdf");
    expect(extract).not.toContain("executeAICapability");
    expect(artifact).not.toContain("executeAICapability");
  });

  it("fails local generation closed when the local guard rejects unsupported changes", () => {
    const worker = read("public/cvengine-local-ai-worker.js");
    expect(worker).toContain("hasNewNumericClaims");
    expect(worker).toContain("LOCAL_FACT_GUARD_REJECTED");
    expect(worker).toContain("CV Engine Local Fact Guardian");
  });
});
