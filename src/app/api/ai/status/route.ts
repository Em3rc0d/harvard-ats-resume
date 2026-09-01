import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";

export async function GET() {
  try {
    await requireAuthenticatedSupabaseContext();
    const production = process.env.NODE_ENV === "production";
    const platformGeminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    const ollamaConfigured = Boolean(process.env.OLLAMA_BASE_URL?.trim()) || !production;

    return NextResponse.json({
      platformGeminiConfigured,
      ollamaConfigured,
      byokSupported: true,
      noCloudTrustedCoreAvailable: true,
      aiOptional: true,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
}
