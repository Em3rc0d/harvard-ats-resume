import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import {
  deleteCareerEvidence,
  reviseCareerEvidence,
} from "../../../../../application/career/CareerEvidenceRepository";
import { ReviseCareerEvidenceInputSchema } from "../../../../../domain/career/CareerEvidenceMutation";
import { careerApiError } from "../../../../../interfaces/http/careerResponse";

const EvidenceIdSchema = z.string().uuid();

type RouteContext = { params: Promise<{ evidenceId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { evidenceId: rawEvidenceId } = await params;
  const evidenceId = EvidenceIdSchema.safeParse(rawEvidenceId);
  const body = await request.json().catch(() => null);
  const input = ReviseCareerEvidenceInputSchema.safeParse(body);

  if (!evidenceId.success || !input.success) {
    return NextResponse.json({ error: "INVALID_CAREER_EVIDENCE_INPUT" }, { status: 400 });
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const evidence = await reviseCareerEvidence(client, user.userId, evidenceId.data, input.data);
    return NextResponse.json({ evidence });
  } catch (error) {
    return careerApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { evidenceId: rawEvidenceId } = await params;
  const evidenceId = EvidenceIdSchema.safeParse(rawEvidenceId);

  if (!evidenceId.success) {
    return NextResponse.json({ error: "INVALID_CAREER_EVIDENCE_ID" }, { status: 400 });
  }

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const deleted = await deleteCareerEvidence(client, user.userId, evidenceId.data);

    if (!deleted) {
      return NextResponse.json({ error: "CAREER_EVIDENCE_NOT_FOUND" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return careerApiError(error);
  }
}
