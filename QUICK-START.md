# CV Engine — Quick Start

CV Engine runs its model-backed resume workflows on a **local Ollama runtime**. No remote LLM API key is required for the default stack.

## Recommended: one-command Docker stack

### Prerequisites

- Docker Desktop / Docker Engine with Docker Compose v2
- At least ~12 GB free disk for the default application + workload models + container layers
- Enough host memory for one local model at a time

CV Engine intentionally uses workload-specific models instead of forcing the largest model into every operation:

- `qwen3:4b-instruct` — resume extraction and inline rewrite
- `qwen3:8b` — final resume generation

The Docker Ollama service is limited to one loaded model at a time by default so a developer laptop does not need to retain both models in memory concurrently.

### Start everything

```bash
cp .env.example .env
docker compose up --build
```

The first start downloads the configured workload models into the persistent `ollama-data` volume. Later starts reuse them. The bootstrap also preloads the import model because resume import is normally the first model-backed user action.

Open:

```text
http://localhost:3000
```

Runtime health:

```text
http://localhost:3000/api/health
```

A healthy stack returns `READY` only when every configured workload model and the durable Redis backend are available.

### NVIDIA GPU acceleration

When Docker can access an NVIDIA GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

If GPU passthrough is unavailable, use the normal CPU compose command.

## Local inference policy

Default workload configuration:

```env
OLLAMA_MODEL=qwen3:8b
OLLAMA_IMPORT_MODEL=qwen3:4b-instruct
OLLAMA_RESUME_MODEL=qwen3:8b
OLLAMA_OPTIMIZE_MODEL=qwen3:4b-instruct
OLLAMA_NUM_CTX=16384
```

Execution budgets are also workload-specific:

- import: 180 seconds maximum by default, 3,072 output-token ceiling
- final resume: 240 seconds maximum by default, 4,096 output-token ceiling
- inline optimization: 45 seconds maximum, 768 output-token ceiling

These are safety ceilings, not target latencies. A request ends as soon as the model finishes.

All model outputs remain **untrusted proposals**. Changing model size or timeout does not bypass source reconciliation, grounding, semantic grounding, claim provenance, or durable Career Vault integrity.

For a higher-quality final generation model on a stronger host:

```env
OLLAMA_RESUME_MODEL=qwen3:14b
```

For a very constrained host, you can also reduce final generation explicitly:

```env
OLLAMA_RESUME_MODEL=qwen3:4b-instruct
```

Do not weaken evidence gates to compensate for a smaller model.

## What Docker starts

```text
Browser
  ↓
CV Engine / Next.js :3000
  ├─→ Ollama :11434
  │      ├─ qwen3:4b-instruct  extraction / optimize
  │      └─ qwen3:8b           final resume
  │
  └─→ Upstash-compatible Redis HTTP proxy
            ↓
          Redis
            └─ persistent data volume
```

Services:

- `app` — CV Engine
- `ollama` — local inference server
- `ollama-init` — pulls every configured workload model and preloads the import model
- `redis` — durable local Redis
- `redis-http` — Upstash-compatible REST facade used by the existing durable repositories

## Useful commands

```bash
# Start / build
docker compose up --build

# Follow logs
docker compose logs -f app ollama

# See installed models
docker compose exec ollama ollama list

# See the currently loaded model and CPU/GPU placement
docker compose exec ollama ollama ps

# Stop containers, preserve data/model volumes
docker compose down

# Stop and also erase local model + Redis volumes
docker compose down -v
```

## Host-run development without Docker

If you prefer Next.js on the host, run Ollama separately and configure durable Redis yourself:

```bash
npm ci
cp .env.example .env
ollama pull qwen3:4b-instruct
ollama pull qwen3:8b
npm run dev
```

Default host Ollama URL:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

You still need `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for trusted durable flows when the application is not using the Docker Compose local Redis stack.

## Trusted flow

```text
Resume PDF/DOCX
   ↓
server-side text extraction
   ↓
qwen3:4b-instruct structured extraction proposal
   ↓
source reconciliation
   ↓
Career Evidence review
   ↓
optional Job / Career Target
   ↓
qwen3:8b constrained resume proposal
   ↓
grounding + semantic grounding
   ↓
claim provenance
   ↓
durable Career Vault
   ↓
trusted ResumeVersion
```

If a local model produces unsupported candidate data, CV Engine removes or blocks it rather than treating it as truth.

## Troubleshooting

### Resume import reaches `RESUME_IMPORT_TIMEOUT`

A timeout means the request crossed its bounded inference window. It does **not** mean Ollama is disconnected and it does not authorize accepting a partial extraction.

Inspect the current model placement:

```bash
docker compose exec ollama ollama ps
```

Then inspect the application/Ollama logs:

```bash
docker compose logs --tail=200 app ollama
```

Successful inference logs include model name, prompt/output token counts, load time, total time, and output tokens/second. CV text itself is not logged.

The default Docker stack uses `qwen3:4b-instruct` for import and an independent 180-second Docker budget so an old `.env` containing the previous 90-second setting cannot silently constrain local inference.

### Local AI unavailable

```bash
docker compose ps
docker compose logs ollama ollama-init
```

Verify all configured models:

```bash
docker compose exec ollama ollama list
```

### First request is slow

The first model load is slower than a warm request. The bootstrap preloads the import model and API calls keep used models alive for subsequent work.

### Not enough memory

CV Engine defaults to one loaded model at a time. If the host is still constrained, use `qwen3:4b-instruct` for final generation too.

### Durable storage unavailable

Inspect:

```bash
docker compose logs redis redis-http
```

The Docker stack intentionally fails closed instead of claiming that Career Vault data was saved when Redis is unavailable.

## Verification before merge

```bash
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test
npm run build
node scripts/verify-pdfjs-server-bundle.mjs
docker compose config
```

The model itself is never the truth authority. The existing evidence and provenance layers remain the release authority.