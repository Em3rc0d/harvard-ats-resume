import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { AIAccessModeSchema } from "../../../domain/ai/AIAccess";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../domain/trust/FirstRunTrust";
import { careerApiError } from "../../../interfaces/http/careerResponse";

const ConsentMutationSchema = z
  .object({
    aiAccessModePreference: AIAccessModeSchema.optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const body = ConsentMutationSchema.parse(await request.json().catch(() => ({})));
    const acknowledgedAt = new Date().toISOString();

    const { data, error } = await client.rpc("cv_engine_acknowledge_consent", {
      p_disclosure_version: CURRENT_TRUST_DISCLOSURE_VERSION,
      p_acknowledged_at: acknowledgedAt,
      p_ai_access_mode_preference: body.aiAccessModePreference ?? null,
    });

    if (error) throw error;
    if (typeof data !== "string") throw new Error("CONSENT_RECEIPT_INVALID");

    return NextResponse.json(
      {
        receiptId: data,
        disclosureVersion: CURRENT_TRUST_DISCLOSURE_VERSION,
        acknowledgedAt,
        aiAccessModePreference: body.aiAccessModePreference ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    return careerApiError(error);
  }
}
