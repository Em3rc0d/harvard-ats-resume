import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { CURRENT_TRUST_DISCLOSURE_VERSION } from "../../../domain/trust/FirstRunTrust";
import { careerApiError } from "../../../interfaces/http/careerResponse";

export async function POST() {
  try {
    const { client } = await requireAuthenticatedSupabaseContext();
    const acknowledgedAt = new Date().toISOString();

    const { data, error } = await client.rpc("cv_engine_acknowledge_consent", {
      p_disclosure_version: CURRENT_TRUST_DISCLOSURE_VERSION,
      p_acknowledged_at: acknowledgedAt,
    });

    if (error) throw error;
    if (typeof data !== "string") throw new Error("CONSENT_RECEIPT_INVALID");

    return NextResponse.json(
      {
        receiptId: data,
        disclosureVersion: CURRENT_TRUST_DISCLOSURE_VERSION,
        acknowledgedAt,
      },
      { status: 201 },
    );
  } catch (error) {
    return careerApiError(error);
  }
}
