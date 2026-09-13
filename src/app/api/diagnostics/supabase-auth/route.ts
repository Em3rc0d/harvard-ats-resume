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

type GoogleDnsAnswer = Readonly<{ type?: number; data?: string }>;
type GoogleDnsResponse = Readonly<{ Status?: number; Answer?: GoogleDnsAnswer[] }>;

async function queryPublicDns(host: string) {
  const dnsUrl = new URL("https://dns.google/resolve");
  dnsUrl.searchParams.set("name", host);
  dnsUrl.searchParams.set("type", "A");

  try {
    const response = await fetch(dnsUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const payload = (await response.json().catch(() => null)) as GoogleDnsResponse | null;
    const aRecords = Array.isArray(payload?.Answer)
      ? payload.Answer.filter((answer) => answer.type === 1 && typeof answer.data === "string").map((answer) => answer.data)
      : [];

    return {
      publicDnsHttpStatus: response.status,
      publicDnsStatus: typeof payload?.Status === "number" ? payload.Status : null,
      publicARecords: aRecords,
    };
  } catch (error) {
    return {
      publicDnsHttpStatus: null,
      publicDnsStatus: null,
      publicARecords: [],
      publicDnsErrorCode: safeErrorCode(error),
    };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return noStoreJson({ error: "NOT_FOUND" }, 404);
  }

  const { url, publishableKey } = requireSupabasePublicConfig();
  const upstream = new URL(url);
  const startedAt = Date.now();
  const dns = await queryPublicDns(upstream.host);

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
      ...dns,
    });
  } catch (error) {
    return noStoreJson(
      {
        configuredHost: upstream.host,
        configuredProtocol: upstream.protocol,
        reachable: false,
        errorCode: safeErrorCode(error),
        elapsedMs: Date.now() - startedAt,
        ...dns,
      },
      503,
    );
  }
}
