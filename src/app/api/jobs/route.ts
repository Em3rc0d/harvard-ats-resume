import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../application/auth/requireAuthenticatedUser";
import { createManualJobSnapshot, listJobSnapshots } from "../../../application/jobs/JobSnapshotRepository";
import { CreateManualJobSnapshotInputSchema } from "../../../domain/jobs/JobSnapshot";
import { b2ApiError } from "../../../interfaces/http/b2Response";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const jobs = await listJobSnapshots(client, user.userId);
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b2ApiError(error);
  }
}

export async function POST(request: Request) {
  const parsed = CreateManualJobSnapshotInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID_JOB_SNAPSHOT_INPUT", issues: parsed.error.issues }, { status: 400 });
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const job = await createManualJobSnapshot(client, user.userId, parsed.data);
    return NextResponse.json({ job }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return b2ApiError(error);
  }
}
