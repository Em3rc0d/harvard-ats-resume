import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../../application/auth/requireAuthenticatedUser";
import { resolvePresentationRevision } from "../../../../../application/presentation/PresentationRevisionRepository";
import { ResolvePresentationRevisionInputSchema } from "../../../../../domain/presentation/PresentationRevision";

const PresentationRevisionIdSchema = z.string().uuid();
const DecisionBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
}).strict();

type RouteContext = {
  params: Promise<{ presentationRevisionId: string }>;
};

function resolutionFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("B9_APPROVAL_SOURCE_STALE")) {
    return { status: 409, error: "PRESENTATION_SOURCE_STALE" } as const;
  }
  if (message.includes("B9_PRESENTATION_ALREADY_RESOLVED")) {
    return { status: 409, error: "PRESENTATION_ALREADY_RESOLVED" } as const;
  }
  if (message.includes("B9_PRESENTATION_REVISION_NOT_FOUND")) {
    return { status: 404, error: "PRESENTATION_REVISION_NOT_FOUND" } as const;
  }

  return { status: 500, error: "PRESENTATION_RESOLUTION_FAILED" } as const;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { presentationRevisionId: rawPresentationRevisionId } = await params;
  const presentationRevisionId = PresentationRevisionIdSchema.safeParse(
    rawPresentationRevisionId,
  );
  const body = await request.json().catch(() => null);
  const decision = DecisionBodySchema.safeParse(body);

  if (!presentationRevisionId.success || !decision.success) {
    return NextResponse.json(
      { error: "INVALID_PRESENTATION_RESOLUTION_INPUT" },
      { status: 400 },
    );
  }

  const command = ResolvePresentationRevisionInputSchema.parse({
    presentationRevisionId: presentationRevisionId.data,
    decision: decision.data.decision,
  });

  try {
    const { user, client } = await requireAuthenticatedSupabaseContext();
    const revision = await resolvePresentationRevision(
      client,
      user.userId,
      command,
    );

    return NextResponse.json(
      { revision },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const failure = resolutionFailure(error);
    return NextResponse.json(
      { error: failure.error },
      {
        status: failure.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
