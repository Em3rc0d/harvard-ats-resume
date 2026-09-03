import { NextResponse } from "next/server";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import { listPresentationRevisions } from "../../../../application/presentation/PresentationRevisionRepository";

export async function GET() {
  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const revisions = await listPresentationRevisions(client, user.userId);

    if (revisions.length === 0) {
      return NextResponse.json(
        { reviews: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const evidenceIds = [...new Set(revisions.map((revision) => revision.evidenceId))];
    const sourceResult = await client
      .from("career_evidence_revisions")
      .select("evidence_id, revision_number, canonical_text")
      .eq("owner_user_id", user.userId)
      .in("evidence_id", evidenceIds);

    if (sourceResult.error) {
      throw new Error(`B9_PRESENTATION_SOURCE_READ_FAILED:${sourceResult.error.message}`);
    }

    const sourceByRevision = new Map(
      (sourceResult.data ?? []).map((row) => [
        `${row.evidence_id}:${row.revision_number}`,
        row.canonical_text,
      ]),
    );

    const reviews = revisions.map((revision) => {
      const sourceText = sourceByRevision.get(
        `${revision.evidenceId}:${revision.evidenceRevision}`,
      );
      if (typeof sourceText !== "string" || sourceText.length === 0) {
        throw new Error("B9_PRESENTATION_SOURCE_REVISION_UNAVAILABLE");
      }
      return { revision, sourceText };
    });

    return NextResponse.json(
      { reviews },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "PRESENTATION_REVIEW_LIST_FAILED" },
      {
        status: 500,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
