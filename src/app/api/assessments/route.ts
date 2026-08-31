import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { createOpportunityAssessment, listOpportunityAssessments } from "../../../application/matching/AssessmentRepository";
import { CreateAssessmentInputSchema } from "../../../domain/matching/Assessment";
import { b3ApiError } from "../../../interfaces/http/b3Response";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const assessments = await listOpportunityAssessments(client, user.userId);
    return NextResponse.json({ assessments }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b3ApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = CreateAssessmentInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_ASSESSMENT_INPUT", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const assessment = await createOpportunityAssessment(client, user.userId, parsed.data.jobSnapshotId);
    return NextResponse.json({ assessment }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b3ApiError(error);
  }
}
