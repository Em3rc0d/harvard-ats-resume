import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../../../infrastructure/supabase/server";
import {
  CURRENT_TRUST_DISCLOSURE_VERSION,
  ConsentReceiptSchema,
} from "../../../domain/trust/FirstRunTrust";
import { AIAccessModeSchema } from "../../../domain/ai/AIAccess";

const ConsentMutationSchema = z
  .object({
    aiAccessModePreference: AIAccessModeSchema.optional(),
  })
  .strict();

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = ConsentMutationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "INVALID_CONSENT_PAYLOAD" }, { status: 400 });
  }

  const acknowledgedAt = new Date().toISOString();
  const receipt = ConsentReceiptSchema.parse({
    ownerUserId: user.id,
    disclosureVersion: CURRENT_TRUST_DISCLOSURE_VERSION,
    acknowledgedAt,
    aiAccessModePreference: parsed.data.aiAccessModePreference,
  });

  const { error } = await supabase.from("consent_receipts").upsert(
    {
      owner_user_id: receipt.ownerUserId,
      disclosure_version: receipt.disclosureVersion,
      acknowledged_at: receipt.acknowledgedAt,
      ai_access_mode_preference: receipt.aiAccessModePreference ?? null,
      updated_at: acknowledgedAt,
    },
    { onConflict: "owner_user_id,disclosure_version" },
  );

  if (error) {
    return NextResponse.json({ success: false, error: "CONSENT_PERSISTENCE_FAILED" }, { status: 503 });
  }

  return NextResponse.json({
    success: true,
    receipt: {
      disclosureVersion: receipt.disclosureVersion,
      acknowledgedAt: receipt.acknowledgedAt,
      aiAccessModePreference: receipt.aiAccessModePreference ?? null,
    },
  });
}
