import { NextResponse } from "next/server";
import { getSupabasePublicConfig } from "../../../infrastructure/supabase/config";
import { createSupabaseServerClient } from "../../../infrastructure/supabase/server";

export async function GET() {
  if (!getSupabasePublicConfig()) {
    return NextResponse.json(
      { authenticated: false, code: "AUTH_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string" || userId.length === 0) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json(
    { authenticated: true, userId },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
