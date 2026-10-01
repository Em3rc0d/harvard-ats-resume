import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { PUBLIC_AI_ACCESS_MODES, byokProviderForAccessMode, isPublicAIAccessMode } from "./ai/AIAccess";
import { buildProviderAttemptPlan } from "../application/ai/AIGatewayFoundation";

const read = (path: string) => fs.readFileSync(path, "utf8");

describe("public BYO AI and local-compute contracts", () => {
  it("offers only user-funded providers or browser-local compute to public users", () => {
    expect(PUBLIC_AI_ACCESS_MODES).toEqual(["BYOK_GEMINI", "BYOK_OPENAI", "BYOK_ANTHROPIC", "LOCAL_BROWSER"]);
    expect(isPublicAIAccessMode("PLATFORM_GEMINI")).toBe(false);
    expect(isPublicAIAccessMode("NO_CLOUD_AI")).toBe(false);
  });

  it("maps public BYOK modes to an explicit provider", () => {
    expect(byokProviderForAccessMode("BYOK_GEMINI")).toBe("GEMINI");
    expect(byokProviderForAccessMode("BYOK_OPENAI")).toBe("OPENAI");
    expect(byokProviderForAccessMode("BYOK_ANTHROPIC")).toBe("ANTHROPIC");
    expect(byokProviderForAccessMode("LOCAL_BROWSER")).toBeNull();
  });

  it("routes request-scoped BYOK through the selected provider", () => {
    expect(buildProviderAttemptPlan("RESUME_HOLISTIC_IMPROVEMENT", "BYOK_REQUEST_SCOPED", "GEMINI")[0]?.provider).toBe("GEMINI");
    expect(buildProviderAttemptPlan("RESUME_HOLISTIC_IMPROVEMENT", "BYOK_REQUEST_SCOPED", "OPENAI")[0]).toMatchObject({ provider: "OPENAI", model: "gpt-5.6-luna" });
    expect(buildProviderAttemptPlan("RESUME_HOLISTIC_IMPROVEMENT", "BYOK_REQUEST_SCOPED", "ANTHROPIC")[0]).toMatchObject({ provider: "ANTHROPIC", model: "claude-sonnet-5" });
  });

  it("hard-blocks platform-owned Gemini from the public improvement route", () => {
    const route = read("src/app/api/resume-improvements/route.ts");
    expect(route).toContain('if (accessMode === "PLATFORM_GEMINI") throw new Error("V12_PLATFORM_AI_PRIVATE")');
    expect(route).toContain("platformGeminiKey: null");
    expect(route).not.toContain("platformGeminiKey: process.env.GEMINI_API_KEY");
  });

  it("never persists raw BYOK credentials", () => {
    const panel = read("src/components/first-run/AIAccessPanel.tsx");
    const session = read("src/components/providers/AIAccessSessionProvider.tsx");
    expect(panel).toContain("does not intentionally save it");
    expect(session).toContain("TransientBYOKStore");
    expect(session).not.toContain("localStorage");
    expect(session).not.toContain("sessionStorage");
  });

  it("treats browser-local AI as a distinct execution boundary", () => {
    const localRuntime = read("src/application/ai/BrowserLocalAIRuntime.ts");
    expect(localRuntime).toContain('"gpu" in navigator');
    expect(localRuntime).toContain('typeof WebAssembly !== "undefined"');
    const route = read("src/app/api/resume-improvements/route.ts");
    expect(route).toContain('if (accessMode === "LOCAL_BROWSER") {');
    expect(route).toContain("browserLocalExecution:");
    expect(route).toContain("platformGeminiKey: null");
    expect(route).toContain("BrowserLocalExecutionRequired");
  });
});