# PR-ATS2-00B — Trust Containment

## Objective

Establish the fundamental trust boundary required for ATS v2 by eliminating all data fabrication and invention logic across the product. The system must operate strictly on facts provided by the user.

## BEFORE

The product was fabricating data in three distinct areas:
1. **Gemini Integration**: The prompt explicitly instructed the LLM to `INVENT realistic metrics` and `INVENT a realistic project title and description`.
2. **CV Upload (n8n)**: When parsing webhook data, if a start date or end date was missing, the application artificially copied the other date, or fabricated both using the `currentYear`.
3. **Certificate Parsing**: When parsing OCR certificate data into education entries, the application artificially assumed a 4-year degree and set `startDate` to `graduationYear - 4`.

## DURING

Executed strict trust containment across the application:
1. Modified `lib/gemini.ts` to strictly forbid data fabrication. Removed instructions to invent metrics and projects, instructing the LLM instead to use placeholders or rewrite sentences dynamically without numbers.
2. Modified `components/CVUpload.tsx` to stop copying missing dates or fabricating the `currentYear`. The system now passes missing dates as explicitly empty strings.
3. Modified `components/ResumeForm.tsx` to stop assuming a 4-year degree (`gradYear - 4`). The `startDate` is now safely left empty.

## Regression Evidence

The following paths were verified to no longer fabricate data:
- **Gemini generation**: Generating a resume using Gemini no longer invents fictional metrics (e.g., "Increased by 20%") or projects that were not in the user's input. The strict negative prompt effectively blocks fabrication.
- **CV Import**: Importing a CV via n8n with missing dates leaves those date fields correctly empty in the UI. The form schema requires manual completion by the user, ensuring the user asserts truth rather than the system guessing.
- **Certificate Upload**: Uploading a certificate populates the graduation date but correctly leaves the start date empty, waiting for the user to provide the factual data.

## AFTER

No automatic data fabrication occurs anywhere in the resume building flow. Trust containment is officially secured. Any missing data must be explicitly populated by the user.

## Gate Status
`G0 REPRODUCIBLE_BASELINE — PASS` (Inherited from PR-ATS2-00)
`G1 TRUST_CONTAINMENT — PASS`
