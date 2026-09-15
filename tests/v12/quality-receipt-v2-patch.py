from __future__ import annotations

from pathlib import Path

SOURCE = Path("tests/v12/production-improve-resume-cert.py")

QUALITY_FUNCTIONS_ANCHOR = '''def quality_scores(source_text: str, improved_text: str, artifact_text: str) -> dict[str, int]:
    headings = ["Professional Summary", "Experience", "Projects", "Education", "Certifications", "Skills", "Languages"]
    material = [line.strip().lower() for line in improved_text.splitlines() if len(line.strip()) >= 30]
    duplicate_count = len(material) - len(set(material))
    return {
        "factualFidelity": 5,
        "atsStructure": 5 if all(heading in artifact_text for heading in headings) else 3,
        "clarity": 4 if improved_text != source_text and "Professional Summary" in artifact_text else 3,
        "concision": 4 if len(improved_text) <= int(len(source_text) * 1.35) else 3,
        "professionalPositioning": 4 if "Full Stack" in improved_text and "Professional Summary" in artifact_text else 3,
        "redundancyReduction": 4 if duplicate_count == 0 else 3,
        "readability": 4 if not any(len(line) > 220 for line in artifact_text.splitlines()) else 3,
        "downloadValidity": 5,
    }


def quality_accepted(hard: dict[str, Any], scores: dict[str, int]) -> bool:
    return (
        hard["sourceParsedSuccessfully"]
        and hard["semanticEntitiesMateriallyCorrect"]
        and hard["candidateAssertionsRemainUsable"]
        and hard["unsupportedNewClaims"] == 0
        and hard["inventedMetrics"] == 0
        and hard["inventedEmployersRolesDates"] == 0
        and hard["docxValid"]
        and hard["pdfValid"]
        and hard["sourceToOutputProvenancePresent"]
        and scores["factualFidelity"] >= 5
        and scores["atsStructure"] >= 4
        and scores["clarity"] >= 4
        and scores["concision"] >= 4
        and scores["professionalPositioning"] >= 4
        and scores["redundancyReduction"] >= 4
        and scores["readability"] >= 4
        and scores["downloadValidity"] >= 5
    )
'''

QUALITY_FUNCTIONS_REPLACEMENT = '''SPANISH_HEADINGS = ["Perfil profesional", "Experiencia profesional", "Proyectos", "Educación", "Certificaciones", "Competencias técnicas", "Idiomas"]
ENGLISH_HEADINGS = ["Professional Summary", "Experience", "Projects", "Education", "Certifications", "Skills", "Languages"]


def normalized_tokens(value: str) -> set[str]:
    normalized = re.sub(r"[^a-z0-9+#./-]+", " ", value.lower())
    return {token for token in normalized.split() if len(token) > 1}


def jaccard(left: str, right: str) -> float:
    a = normalized_tokens(left)
    b = normalized_tokens(right)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def narrative_lines(value: str) -> list[str]:
    lines: list[str] = []
    for raw in value.splitlines():
        line = raw.strip().lstrip("-• ").strip()
        if len(line) < 50 or line.startswith("Stack:") or line.upper() == line:
            continue
        lines.append(line)
    return lines


def materially_rewritten_ratio(source_text: str, improved_text: str) -> float:
    source_lines = narrative_lines(source_text)
    improved_lines = narrative_lines(improved_text)
    if not source_lines or not improved_lines:
        return 0.0
    rewritten = 0
    for source_line in source_lines:
        max_similarity = max(jaccard(source_line, improved_line) for improved_line in improved_lines)
        if max_similarity < 0.86:
            rewritten += 1
    return rewritten / len(source_lines)


def summary_section(artifact_text: str) -> str:
    if "Perfil profesional" not in artifact_text or "Experiencia profesional" not in artifact_text:
        return ""
    return artifact_text.split("Perfil profesional", 1)[1].split("Experiencia profesional", 1)[0].strip()


def summary_positioning_preserved(artifact_text: str) -> bool:
    summary = summary_section(artifact_text).lower()
    return (
        "full stack" in summary
        and "end-to-end" in summary
        and "backend" in summary
        and ("inteligencia artificial" in summary or "applied ai" in summary or " ia " in f" {summary} ")
    )


def quality_scores(source_text: str, improved_text: str, artifact_text: str) -> dict[str, int]:
    material = [line.strip().lower() for line in improved_text.splitlines() if len(line.strip()) >= 30]
    duplicate_count = len(material) - len(set(material))
    locale_ok = all(heading in artifact_text for heading in SPANISH_HEADINGS) and not any(heading in artifact_text for heading in ENGLISH_HEADINGS)
    rewrite_ratio = materially_rewritten_ratio(source_text, improved_text)
    positioning_ok = summary_positioning_preserved(artifact_text)
    return {
        "factualFidelity": 5,
        "atsStructure": 5 if locale_ok else 3,
        "clarity": 4 if rewrite_ratio >= 0.30 and "Perfil profesional" in artifact_text else 3,
        "concision": 4 if len(improved_text) <= int(len(source_text) * 1.35) else 3,
        "professionalPositioning": 4 if positioning_ok else 3,
        "redundancyReduction": 4 if duplicate_count == 0 else 3,
        "readability": 4 if not any(len(line) > 220 for line in artifact_text.splitlines()) else 3,
        "downloadValidity": 5,
    }


def quality_accepted(hard: dict[str, Any], scores: dict[str, int]) -> bool:
    return (
        hard["sourceParsedSuccessfully"]
        and hard["semanticEntitiesMateriallyCorrect"]
        and hard["candidateAssertionsRemainUsable"]
        and hard["unsupportedNewClaims"] == 0
        and hard["inventedMetrics"] == 0
        and hard["inventedEmployersRolesDates"] == 0
        and hard["docxValid"]
        and hard["pdfValid"]
        and hard["sourceToOutputProvenancePresent"]
        and hard["localeConsistent"]
        and hard["materialImprovementPresent"]
        and hard["summaryPositioningPreserved"]
        and hard["noSparseTrailingPage"]
        and scores["factualFidelity"] >= 5
        and scores["atsStructure"] >= 4
        and scores["clarity"] >= 4
        and scores["concision"] >= 4
        and scores["professionalPositioning"] >= 4
        and scores["redundancyReduction"] >= 4
        and scores["readability"] >= 4
        and scores["downloadValidity"] >= 5
    )
'''

HARD_GATE_ANCHOR = '''                scores = quality_scores(source_text, improved_text, artifact_text)
                hard = {
                    "sourceParsedSuccessfully": True,
                    "semanticEntitiesMateriallyCorrect": all(section in artifact_text for section in ["Experience", "Projects", "Education", "Certifications", "Skills", "Languages"]),
                    "candidateAssertionsRemainUsable": not missing_facts,
                    "unsupportedNewClaims": int(payload.get("unsupportedNewClaims", -1)),
                    "inventedMetrics": len(invented_numbers),
                    "inventedEmployersRolesDates": 0,
                    "docxValid": True,
                    "pdfValid": True,
                    "sourceToOutputProvenancePresent": True,
                }
                accepted = quality_accepted(hard, scores)
                quality_receipt = {
                    "schemaVersion": "v12-real-cv-quality-receipt-v1",
'''

HARD_GATE_REPLACEMENT = '''                quality_payload = payload.get("quality")
                layout_payload = payload.get("layout")
                if not isinstance(quality_payload, dict) or not isinstance(layout_payload, dict):
                    fail("V12_BROWSER_QUALITY_DIAGNOSTICS_MISSING")
                server_material = quality_payload.get("materialImprovementPresent") is True
                independent_material = materially_rewritten_ratio(source_text, improved_text) >= 0.30
                locale_consistent = (
                    quality_payload.get("localeConsistent") is True
                    and all(section in artifact_text for section in SPANISH_HEADINGS)
                    and not any(section in artifact_text for section in ENGLISH_HEADINGS)
                )
                positioning_preserved = (
                    quality_payload.get("summaryPositioningPreserved") is True
                    and summary_positioning_preserved(artifact_text)
                )
                no_sparse_trailing_page = (
                    layout_payload.get("sparseTrailingPage") is False
                    and provenance.get("layout", {}).get("sparseTrailingPage") is False
                )
                scores = quality_scores(source_text, improved_text, artifact_text)
                hard = {
                    "sourceParsedSuccessfully": True,
                    "semanticEntitiesMateriallyCorrect": all(section in artifact_text for section in SPANISH_HEADINGS),
                    "candidateAssertionsRemainUsable": not missing_facts,
                    "unsupportedNewClaims": int(payload.get("unsupportedNewClaims", -1)),
                    "inventedMetrics": len(invented_numbers),
                    "inventedEmployersRolesDates": 0,
                    "docxValid": True,
                    "pdfValid": True,
                    "sourceToOutputProvenancePresent": True,
                    "localeConsistent": locale_consistent,
                    "materialImprovementPresent": server_material and independent_material,
                    "summaryPositioningPreserved": positioning_preserved,
                    "noSparseTrailingPage": no_sparse_trailing_page,
                }
                accepted = quality_accepted(hard, scores)
                quality_receipt = {
                    "schemaVersion": "v12-real-cv-quality-receipt-v2",
'''

NOTES_ANCHOR = '''                    "notes": ["Representative fixture contains Spanish profile, employment, multiple projects, technologies, education, certification and languages."],
'''
NOTES_REPLACEMENT = '''                    "notes": [
                        "Representative fixture contains Spanish profile, employment, multiple projects, technologies, education, certification and languages.",
                        f"independentMaterialRewriteRatio={materially_rewritten_ratio(source_text, improved_text):.3f}",
                        f"layoutPages={layout_payload.get('pageCount')}",
                        f"trailingPageFillRatio={layout_payload.get('trailingPageFillRatio')}",
                    ],
'''


def replace_once(source: str, anchor: str, replacement: str, code: str) -> str:
    count = source.count(anchor)
    if count != 1:
        raise RuntimeError(f"{code}:{count}")
    return source.replace(anchor, replacement, 1)


def main() -> int:
    source = SOURCE.read_text(encoding="utf-8")
    source = replace_once(source, QUALITY_FUNCTIONS_ANCHOR, QUALITY_FUNCTIONS_REPLACEMENT, "V12_QUALITY_FUNCTIONS_PATCH_MISMATCH")
    source = replace_once(source, HARD_GATE_ANCHOR, HARD_GATE_REPLACEMENT, "V12_QUALITY_HARD_GATE_PATCH_MISMATCH")
    source = replace_once(source, NOTES_ANCHOR, NOTES_REPLACEMENT, "V12_QUALITY_NOTES_PATCH_MISMATCH")
    SOURCE.write_text(source, encoding="utf-8")
    print("V12_QUALITY_RECEIPT_V2_PATCHED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
