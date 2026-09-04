import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import {
  createResumePlan,
  listResumePlans,
} from "../../../application/resume/ResumePlanRepository";
import { CreateResumePlanInputSchema } from "../../../domain/resume/ResumePlan";

function planApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("B9_TARGET_ASSESSMENT_STALE")) {
    return NextResponse.json(
      { error: "TARGET_ASSESSMENT_STALE" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (message.includes("B9_TARGET_ASSESSMENT_REQUIRED")) {
    return NextResponse.json(
      { error: "TARGET_ASSESSMENT_REQUIRED" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (message.includes("B9_TARGET_ASSESSMENT_NOT_FOUND")) {
    return NextResponse.json(
      { error: "TARGET_ASSESSMENT_NOT_FOUND" },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (message.includes("B9_RESUME_PLAN_VERIFIED_EVIDENCE_MISSING")) {
    return NextResponse.json(
      { error: "VERIFIED_CAREER_EVIDENCE_REQUIRED" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (message.includes("B9_TARGET_SUPPORT_MISSING")) {
    return NextResponse.json(
      { error: "TARGETED_PLAN_HAS_NO_SUPPORTED_EVIDENCE" },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { error: "RESUME_PLAN_OPERATION_FAILED" },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const plans = await listResumePlans(client, user.userId);
    return NextResponse.json(
      { plans },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return planApiError(error);
  }
}

export async function POST(request: Request) {
  const input = CreateResumePlanInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) {
    return NextResponse.json(
      { error: "INVALID_RESUME_PLAN_INPUT", issues: input.error.issues },
      { status: 400 },
    );
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const plan = await createResumePlan(client, user.userId, input.data);
    return NextResponse.json(
      { plan },
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return planApiError(error);
  }
}
