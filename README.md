# CV Engine

**Career Opportunity Intelligence with evidence-bound local AI and deterministic guardrails.**

CV Engine is not a keyword-stuffing ATS resume builder. It separates candidate truth, market truth, derived fit, bounded AI assistance, deterministic resume presentation, and durable history so a job description or model response cannot silently become a career fact.

> **Core principle:** evidence before persuasion.

## Current release status

This repository is in **release-candidate hardening**. Build/CI success is necessary but is not treated as proof of product release; real flow dogfood and evidence gates remain required.

## Product model

```text
Career Evidence / Career Vault
            ↓
        Career Target
            ↓
       Job Snapshot
            ↓
     Job Intelligence
            ↓
        Job Match
            ↓
 Opportunity Assessment
            ↓
 Apply / Prepare / Skip context
            ↓
 deterministic source-preserving resume composition
            ↓
 deterministic grounding
            ↓
 semantic grounding
            ↓
 claim provenance / composition
            ↓
 durable ResumeVersion
```

The system maintains these boundaries:

- **Candidate evidence** describes what the candidate can support.
- **Job descriptions** are external market requirements, never candidate evidence.
- **Career Target** records intent/preferences, never capability.
- **Job Match** is evidence-backed requirement analysis, not hiring probability.
- **Opportunity Assessment** is decision support derived from existing evidence and job truth.
- **Local AI output** is used only for bounded proposal capabilities such as source extraction and inline wording assistance; it is never an authority over candidate truth or the author of the final trusted resume.
- **Final resume assembly** is deterministic and application-owned.
- **ResumeVersion** is emitted only after grounding, semantic grounding, claim provenance, and durable persistence succeed.

## Trust invariants

1. No source match → no imported fact.
2. Missing evidence → remain missing; do not invent it.
3. Job requirement ≠ candidate fact.
4. Career preference ≠ candidate capability.
5. No assertion support → no trusted ResumeClaim.
6. Model failure or guardrail failure → safe stop for the affected capability; no unsupported fact is promoted.
7. Unsupported parser/model leaves may be omitted while supported source-backed evidence survives.
8. Final resume assembly does not depend on a whole-resume model call.
9. Durable Career Vault operations fail closed; they are not silently downgraded to in-memory persistence.

## Local intelligence runtime

The default release architecture does **not require a remote LLM provider or API key**.

```text
                   CV Engine
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
Deterministic trusted core      Local AI (Ollama)
                                bounded assistance only
candidate truth                 │
source reconciliation           ├─ resume extraction proposal
Job Intelligence / Match        └─ inline wording proposal
trusted advice                        │
grounding                             ▼
semantic grounding              deterministic validation
resume composition                    │
claim provenance                      ▼
durability                       accepted or rejected
        │
        ▼
 trusted ResumeVersion
```

The local structured runtime currently serves two bounded capabilities:

- resume source extraction proposal;
- inline candidate-text presentation optimization.

The model cannot bypass application-owned truth contracts, and final resume materialization is not a model workload.

### Workload-specific local model defaults

The default local configuration is intentionally workload-specific rather than assigning one large model to every task:

- `qwen3:1.7b` — bounded resume import extraction;
- `qwen3:4b-instruct` — bounded inline wording optimization;
- no model — final resume assembly is deterministic and application-owned.

These defaults are runtime configuration, not a claim that smaller hardware or other model combinations are supported. Runtime support is established only by the identified characterization evidence and release policy.

## Resume import

Supported resume formats:

- PDF with machine-readable text;
- DOCX;
- maximum 10 MB.

Import pipeline:

```text
file validation
  ↓
server-side document text extraction
  ↓
local structured extraction proposal where needed
  ↓
source reconciliation
  ↓
unsupported leaves removed
  ↓
only source-backed fields retained
  ↓
source receipt + evidence map
  ↓
Candidate Review
```

A model-extracted value is never accepted merely because the model returned it. The corresponding value must be recoverable from the source document under the reconciliation contract.

## Resume generation and provenance

```text
Career Evidence
  +
optional target Job Description
  ↓
deterministic source-preserving resume assembly
  ↓
text normalization
  ↓
deterministic grounding
  ↓
semantic grounding
  ↓
resume composition
  ↓
claim-to-CareerAssertion provenance
  ↓
Career Vault durable commit + reload verification
  ↓
ResumeVersion
```

The materialization provenance for the current trusted composer is application-owned (`cv-engine-deterministic` / `source-preserving-resume-composer-v2`). Trusted Advice is also application-owned and deterministic/context-aware. The local model does not author the visible Suggestions channel or the final resume.

## Public product flow

```text
START
  ├─ Import PDF/DOCX
  │      ↓
  │  Imported Resume Review
  │      ↓
  └─ Manual Career Evidence
         ↓
      Career Target
         ↓
 Specific Job + Opportunity Assessment
         or
 General Resume
         ↓
 Trusted Generation
         ↓
 Guardrails / Provenance
         ↓
 Results + durable ResumeVersion
```

Opportunity Space is a separate comparison surface that evaluates several job descriptions against one stable CareerSnapshot and one Career Target.

## Docker: full local stack

The recommended development/runtime path is Docker Compose because it makes bounded local AI and durable storage part of the same reproducible system.

```bash
cp .env.example .env
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

Health endpoint:

```text
http://localhost:3000/api/health
```

The Compose stack owns:

```text
app                 Next.js CV Engine
ollama              local model server for bounded AI capabilities
ollama-init         configured model bootstrap
redis               durable local data store
redis-http          Upstash-compatible REST facade
```

The local Redis REST facade preserves the existing `@upstash/redis` repository contract, so Docker development does not need an external Upstash database.

### NVIDIA GPU override

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Use this only when the Docker host can expose an NVIDIA GPU to containers. CPU execution remains the portable default for the currently characterized reference runtime; lower or different hardware is not inferred to be supported without evidence.

See `QUICK-START.md` for operational commands and troubleshooting.

## Host-run development

When running Next.js outside Docker:

```bash
npm ci
ollama pull qwen3:1.7b
ollama pull qwen3:4b-instruct
cp .env.example .env
npm run dev
```

Default local model configuration:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
OLLAMA_IMPORT_MODEL=qwen3:1.7b
OLLAMA_OPTIMIZE_MODEL=qwen3:4b-instruct
OLLAMA_NUM_CTX=8192
RESUME_IMPORT_TIMEOUT_MS=180000
```

There is no whole-resume generation model setting because final resume assembly is deterministic. Host-run trusted durable flows still require a valid `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Docker Compose supplies local equivalents automatically.

## Environment

Important server-side settings:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
OLLAMA_IMPORT_MODEL=qwen3:1.7b
OLLAMA_OPTIMIZE_MODEL=qwen3:4b-instruct
OLLAMA_NUM_CTX=8192
RESUME_IMPORT_TIMEOUT_MS=180000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

There is no required remote-model API key in the default runtime.

## API surfaces

Primary public routes include:

- `GET /api/health` — bounded local AI + durable Redis readiness;
- `POST /api/import-resume` — trusted PDF/DOCX intake;
- `POST /api/extract-certificate-text` — bounded PDF certificate text extraction;
- `POST /api/optimize-content` — fact-preserving local wording assistance;
- `POST /api/assess-opportunity` — target-aware opportunity assessment;
- `POST /api/opportunity-space` — durable multi-opportunity composition;
- `POST /api/generate-resume` — deterministic trusted resume composition + provenance + durability.

Additional market-observation routes implement the controlled market architecture and remain intentionally separate from candidate truth.

## Rate limiting and durability

Public API requests use endpoint-scoped, non-reversible request identities. Rate limiting may use process memory for host-run local development, but trusted Career Vault/history durability never silently falls back to memory.

Docker Compose runs a persistent local Redis plus an Upstash-compatible HTTP layer. Redis and Ollama use named volumes so model weights and durable state survive ordinary container restarts.

## Verification

Before merging release changes, run:

```bash
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test
npm run build
node scripts/verify-pdfjs-server-bundle.mjs
docker compose config
```

CI remains responsible for dependency audit, local-only AI enforcement, lint, typecheck, behavior tests, production build, PDF.js bundle verification, identified Docker build verification, and Chromium acceptance. None of those gates is by itself a substitute for the field release receipts required by the current candidate.

## Interaction learning: deliberate next boundary

CV Engine may later learn from corrections and outcomes, but it should **not automatically fine-tune itself from raw user interactions**. The safe next architecture is typed interaction events:

```text
user correction / accept / reject
          ↓
InteractionEvent
          ↓
source + provider + model + contract context
          ↓
curated evaluation signal
          ↓
benchmark / prompt / policy / model improvement
```

Only curated, permissioned evidence should ever become training material. Interaction history does not become candidate truth and does not mutate the model online.

## What CV Engine does not claim

CV Engine does not claim to:

- predict whether a company will hire the candidate;
- turn missing job requirements into candidate experience;
- invent metrics to make bullets sound stronger;
- infer credentials, seniority, ownership, impact, or technologies without evidence;
- guarantee that a resume will “beat” an ATS;
- treat any model response as a trusted career record by itself;
- treat CI success or a synthetic browser fixture as proof that a physical release path has passed.

The product is designed to help a person decide and present more clearly **without corrupting the evidence that decision depends on**.
