import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "../../../infrastructure/supabase/config";
import { createSupabaseServerClient } from "../../../infrastructure/supabase/server";

function sameOriginDestination(request: NextRequest, rawNext: string | null) {
  const fallback = new URL("/", request.url);
  if (!rawNext) return fallback;

  try {
    const candidate = new URL(rawNext, request.url);
    return candidate.origin === fallback.origin ? candidate : fallback;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const config = getSupabasePublicConfig();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = sameOriginDestination(request, url.searchParams.get("next"));

  if (!config) {
    return NextResponse.redirect(new URL("/?auth=not-configured", request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?auth=missing-code", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/?auth=callback-failed", request.url));
  }

  return NextResponse.redirect(destination);
}
