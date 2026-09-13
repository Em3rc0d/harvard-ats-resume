import { NextResponse } from "next/server";
import { requireSupabasePublicConfig } from "../../../../infrastructure/supabase/config";

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  const cause = error.cause;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string") {
    return cause.code;
  }
  return error.name || "ERROR";
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return noStoreJson({ error: "NOT_FOUND" }, 404);
  }

  const { url, publishableKey } = requireSupabasePublicConfig();
  const upstream = new URL(url);
  const startedAt = Date.now();

  try {
    const response = await fetch(new URL("/auth/v1/health", upstream), {
      method: "GET",
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    return noStoreJson({
      configuredHost: upstream.host,
      configuredProtocol: upstream.protocol,
      reachable: response.ok,
      authHealthStatus: response.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    return noStoreJson(
      {
        configuredHost: upstream.host,
        configuredProtocol: upstream.protocol,
        reachable: false,
        errorCode: safeErrorCode(error),
        elapsedMs: Date.now() - startedAt,
      },
      503,
    );
  }
}
