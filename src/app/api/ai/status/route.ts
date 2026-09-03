import { NextResponse } from "next/server";
import { AuthenticationRequiredError, requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";

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
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    }
    const message = error instanceof Error ? error.message : "AI_STATUS_UNAVAILABLE";
    if (message.includes("SUPABASE_PUBLIC_CONFIG_MISSING")) {
      return NextResponse.json({ error: "DURABLE_STORE_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ error: "AI_STATUS_UNAVAILABLE" }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
