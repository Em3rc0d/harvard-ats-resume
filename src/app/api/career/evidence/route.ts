import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import {
  createManualCareerEvidence,
  listCurrentCareerEvidence,
} from "../../../../application/career/CareerEvidenceRepository";
import { CreateManualCareerEvidenceInputSchema } from "../../../../domain/career/CareerEvidenceMutation";
import { careerApiError } from "../../../../interfaces/http/careerResponse";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const evidence = await listCurrentCareerEvidence(client, user.userId);
    return NextResponse.json({ evidence }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return careerApiError(error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateManualCareerEvidenceInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_CAREER_EVIDENCE_INPUT", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const evidence = await createManualCareerEvidence(client, user.userId, parsed.data);
    return NextResponse.json({ evidence }, { status: 201 });
  } catch (error) {
    return careerApiError(error);
  }
}
