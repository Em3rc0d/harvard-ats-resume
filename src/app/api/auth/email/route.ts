import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../../infrastructure/supabase/server";

const EmailSchema = z.string().trim().email().max(320);
const PasswordSchema = z.string().min(8).max(256);

const EmailAuthRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("SIGN_IN"), email: EmailSchema, password: PasswordSchema }).strict(),
  z.object({ mode: z.literal("SIGN_UP"), email: EmailSchema, password: PasswordSchema }).strict(),
  z.object({ mode: z.literal("MAGIC_LINK"), email: EmailSchema }).strict(),
]);

type AuthErrorLike = Error & { status?: number };

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function requestIsSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
}

function authFailure(error: AuthErrorLike) {
  const upstreamStatus = typeof error.status === "number" ? error.status : 503;
  const status =
    upstreamStatus === 429
      ? 429
      : upstreamStatus >= 500
        ? 503
        : upstreamStatus === 400 || upstreamStatus === 401
          ? upstreamStatus
          : 400;

  const message =
    status === 503
      ? "Authentication is temporarily unavailable. Please try again."
      : error.message || "Authentication failed. Please try again.";

  return noStoreJson({ error: "AUTH_REQUEST_FAILED", message }, status);
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) {
    return noStoreJson({ error: "ORIGIN_NOT_ALLOWED" }, 403);
  }

  const parsed = EmailAuthRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return noStoreJson({ error: "INVALID_AUTH_REQUEST", message: "Check your email and password." }, 400);
  }

  try {
    const client = await createSupabaseServerClient();
    const redirectTo = new URL("/auth/callback", request.url).toString();

    if (parsed.data.mode === "SIGN_IN") {
      const { data, error } = await client.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      if (error) return authFailure(error);
      if (!data.session) {
        return noStoreJson(
          { error: "AUTH_SESSION_MISSING", message: "CV Engine could not start your session. Please try again." },
          503,
        );
      }
      return noStoreJson({ authenticated: true, confirmationRequired: false });
    }

    if (parsed.data.mode === "SIGN_UP") {
      const { data, error } = await client.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) return authFailure(error);
      return noStoreJson(
        {
          authenticated: Boolean(data.session),
          confirmationRequired: !data.session,
        },
        201,
      );
    }

    const { error } = await client.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return authFailure(error);
    return noStoreJson({ sent: true }, 202);
  } catch {
    return noStoreJson(
      { error: "AUTH_UPSTREAM_UNAVAILABLE", message: "Authentication is temporarily unavailable. Please try again." },
      503,
    );
  }
}
