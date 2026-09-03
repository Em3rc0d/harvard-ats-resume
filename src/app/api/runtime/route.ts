import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const gitCommitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.CVENGINE_RELEASE_SHA ??
    "UNKNOWN";
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
  const platformGeminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

  return NextResponse.json(
    {
      service: "cvengine",
      releaseContract: "b8-release-hardening-v1",
      gitCommitSha,
      environment,
      exactHeadObservable: gitCommitSha !== "UNKNOWN",
      supabaseConfigured,
      platformGeminiConfigured,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
