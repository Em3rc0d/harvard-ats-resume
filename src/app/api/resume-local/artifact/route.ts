import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedSupabaseContext } from "../../../../application/auth/requireAuthenticatedUser";
import {
  renderV12ResumeDocx,
  renderV12ResumePdf,
  renderV12ResumeText,
  type V12ResumeSemanticLine,
} from "../../../../application/resume/V12ProfessionalResumeRenderer";
import { wrapV12ResumeArtifactText } from "../../../../application/resume/V12ReadableResumeText";

export const runtime = "nodejs";

const BodySchema = z.object({
  improvedText: z.string().trim().min(1).max(100_000),
  format: z.enum(["docx", "pdf", "text"]),
}).strict();

const KNOWN_HEADINGS = new Set([
  "professional summary", "summary", "profile", "perfil profesional", "perfil",
  "experience", "professional experience", "experiencia", "experiencia profesional",
  "projects", "proyectos", "education", "educación", "certifications", "certificaciones",
  "skills", "technical skills", "competencias técnicas", "languages", "idiomas",
]);

function semanticLines(text: string): V12ResumeSemanticLine[] {
  const raw = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return raw.map((line, index) => {
    const normalized = line.replace(/:$/, "").toLocaleLowerCase("en-US");
    if (index === 0 && line.length <= 100) return { kind: "NAME", text: line };
    if (KNOWN_HEADINGS.has(normalized) || (/^[A-ZÁÉÍÓÚÑ0-9 &/+-]{3,}$/.test(line) && line.length <= 80)) {
      return { kind: "HEADING", text: line.replace(/:$/, "") };
    }
    if (/^(?:[-•*]|\d+[.)])\s+/.test(line)) {
      return { kind: "BULLET", text: line.replace(/^(?:[-•*]|\d+[.)])\s+/, "") };
    }
    return { kind: "BODY", text: line };
  });
}

export async function POST(request: Request) {
  await requireAuthenticatedSupabaseContext();
  const body = BodySchema.parse(await request.json());
  const lines = semanticLines(body.improvedText);
  if (body.format === "docx") {
    return new Response(Buffer.from(renderV12ResumeDocx(lines)), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Cache-Control": "private, no-store" },
    });
  }
  if (body.format === "pdf") {
    return new Response(Buffer.from(renderV12ResumePdf(lines)), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
    });
  }
  return new Response(wrapV12ResumeArtifactText(renderV12ResumeText(lines)), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
