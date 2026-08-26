# CV Engine

**Career Opportunity Intelligence with evidence-bound local AI and deterministic guardrails.**

CV Engine is not a keyword-stuffing ATS resume builder. It separates candidate truth, market truth, derived fit, generated presentation, and durable history so a job description or model response cannot silently become a career fact.

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
 local constrained resume proposal
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
- **Local AI output** is an untrusted proposal, never an authority over candidate truth.
- **ResumeVersion** is emitted only after grounding, semantic grounding, claim provenance, and durable persistence succeed.

## Trust invariants

1. No source match → no imported fact.
2. Missing evidence → remain missing; do not invent it.
3. Job requirement ≠ candidate fact.
4. Career preference ≠ candidate capability.
5. No assertion support → no trusted ResumeClaim.
6. Model failure or guardrail failure → safe stop; no trusted ResumeVersion is emitted.
7. Unsupported parser/model leaves may be omitted while supported source-backed evidence survives.
8. Durable Career Vault operations fail closed; they are not silently downgraded to in-memory persistence.

## Local intelligence runtime

The default release architecture does **not require a remote LLM provider or API key**.

```text
CV Engine deterministic core
       │
       ├─ candidate truth
       ├─ source reconciliation
       ├─ Job Intelligence / Match
       ├─ trusted advice
       ├─ grounding
       ├─ semantic grounding
       ├─ claim provenance
       └─ durability
       │
       ↓
Local AI runtime (Ollama)
       │
       └─ qwen3:8b by default
              ↓
       untrusted proposal
              ↓
       CV Engine validation
              ↓
       trusted artifact
```

The same local structured runtime currently serves three bounded capabilities:

- resume source extraction proposal;
- fact-preserving resume presentation rewrite;
- inline candidate-text presentation optimization.

The model cannot bypass application-owned truth contracts.

### Why Qwen3 8B is the default

`qwen3:8b` provides a practical local baseline for multilingual resume material and structured-output workloads while remaining small enough to run on many developer machines. Hosts with more memory can set `OLLAMA_MODEL=qwen3:14b`; smaller hosts can explicitly test a smaller compatible model. The model choice is configuration, not architecture.

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
local structured extraction proposal
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
local constrained rewrite proposal
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

Trusted Advice is application-owned and deterministic/context-aware. The local model does not author the visible Suggestions channel.

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

The recommended development/runtime path is Docker Compose because it makes the model and durable storage part of the same reproducible system.

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
ollama              local model server
ollama-init         configured model bootstrap
redis               durable local data store
redis-http          Upstash-compatible REST facade
```

The local Redis REST facade preserves the existing `@upstash/redis` repository contract, so Docker development does not need an external Upstash database.

### NVIDIA GPU override

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Use this only when the Docker host can expose an NVIDIA GPU to containers. CPU execution remains the portable default.

See `QUICK-START.md` for operational commands and troubleshooting.

## Host-run development

When running Next.js outside Docker:

```bash
npm ci
ollama pull qwen3:8b
cp .env.example .env
npm run dev
```

Default local model configuration:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_NUM_CTX=16384
```

Host-run trusted durable flows still require a valid `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Docker Compose supplies local equivalents automatically.

## Environment

Important server-side settings:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_IMPORT_MODEL=
OLLAMA_RESUME_MODEL=
OLLAMA_OPTIMIZE_MODEL=
OLLAMA_NUM_CTX=16384
RESUME_IMPORT_TIMEOUT_MS=90000
RESUME_GENERATION_TIMEOUT_MS=120000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

There is no required remote-model API key in the default runtime.

## API surfaces

Primary public routes include:

- `GET /api/health` — local model + durable Redis readiness;
- `POST /api/import-resume` — trusted PDF/DOCX intake;
- `POST /api/extract-certificate-text` — bounded PDF certificate text extraction;
- `POST /api/optimize-content` — fact-preserving local wording assistance;
- `POST /api/assess-opportunity` — target-aware opportunity assessment;
- `POST /api/opportunity-space` — durable multi-opportunity composition;
- `POST /api/generate-resume` — trusted resume generation + provenance + durability.

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

CI remains responsible for dependency audit, lint, typecheck, behavior tests, production build, PDF.js bundle verification, and Chromium acceptance. The local-model migration must not weaken any of those gates.

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
- treat any model response as a trusted career record by itself.

The product is designed to help a person decide and present more clearly **without corrupting the evidence that decision depends on**.
