import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("B0.5 secret boundary", () => {
  it("keeps the CV Engine Gemini platform credential server-only", () => {
    const envExample = read(".env.example");

    expect(envExample).toContain("GEMINI_API_KEY=");
    expect(envExample).not.toContain("NEXT_PUBLIC_GEMINI_API_KEY");
    expect(envExample).not.toContain("NEXT_PUBLIC_OLLAMA_API_KEY");
  });

  it("does not use browser persistence APIs for BYOK handling", () => {
    const provider = read("src/components/providers/AIAccessSessionProvider.tsx");
    const panel = read("src/components/first-run/AIAccessPanel.tsx");
    const implementation = `${provider}\n${panel}`;

    expect(implementation).not.toContain("localStorage");
    expect(implementation).not.toContain("sessionStorage");
    expect(implementation).not.toContain("indexedDB");
    expect(implementation).not.toContain("document.cookie");
  });

  it("uses the current Supabase SSR package rather than deprecated auth helpers", () => {
    const browserClient = read("src/infrastructure/supabase/browser.ts");
    const serverClient = read("src/infrastructure/supabase/server.ts");
    const proxyClient = read("src/infrastructure/supabase/update-session.ts");
    const implementation = `${browserClient}\n${serverClient}\n${proxyClient}`;

    expect(implementation).toContain("@supabase/ssr");
    expect(implementation).not.toContain("@supabase/auth-helpers-nextjs");
    expect(proxyClient).toContain("auth.getClaims()");
  });
});
