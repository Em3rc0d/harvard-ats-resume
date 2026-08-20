# CV Engine — Quick Start

CV Engine now runs its model-backed resume workflows on a **local Ollama runtime**. No remote LLM API key is required for the default stack.

## Recommended: one-command Docker stack

### Prerequisites

- Docker Desktop / Docker Engine with Docker Compose v2
- At least ~10 GB free disk for the default application + model + container layers
- Enough host memory for the selected local model

The default model is `qwen3:8b` (about 5.2 GB of model weights in Ollama).

### Start everything

```bash
cp .env.example .env
docker compose up --build
```

The first start downloads the model into the persistent `ollama-data` volume. Later starts reuse it.

Open:

```text
http://localhost:3000
```

Runtime health:

```text
http://localhost:3000/api/health
```

A healthy stack returns `READY` only when both the local model and durable Redis backend are available.

### NVIDIA GPU acceleration

When Docker can access an NVIDIA GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

If GPU passthrough is unavailable, use the normal CPU compose command.

## Model choices

Default:

```env
OLLAMA_MODEL=qwen3:8b
```

Larger local option for hosts with more memory:

```env
OLLAMA_MODEL=qwen3:14b
```

All model outputs remain **untrusted proposals**. Changing the model does not bypass source reconciliation, grounding, semantic grounding, claim provenance, or durable Career Vault integrity.

Optional capability-specific overrides:

```env
OLLAMA_IMPORT_MODEL=
OLLAMA_RESUME_MODEL=
OLLAMA_OPTIMIZE_MODEL=
```

Blank values inherit `OLLAMA_MODEL`.

## What Docker starts

```text
Browser
  ↓
CV Engine / Next.js :3000
  ├─→ Ollama :11434
  │      └─ qwen3:8b (persistent model volume)
  │
  └─→ Upstash-compatible Redis HTTP proxy
            ↓
          Redis
            └─ persistent data volume
```

Services:

- `app` — CV Engine
- `ollama` — local inference server
- `ollama-init` — pulls the configured model once when needed
- `redis` — durable local Redis
- `redis-http` — Upstash-compatible REST facade used by the existing durable repositories

## Useful commands

```bash
# Start / build
Docker compose up --build

# Follow logs
docker compose logs -f app ollama

# See installed local models
docker compose exec ollama ollama list

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
local structured extraction proposal
   ↓
source reconciliation
   ↓
Career Evidence review
   ↓
optional Job / Career Target
   ↓
local constrained resume proposal
   ↓
grounding + semantic grounding
   ↓
claim provenance
   ↓
durable Career Vault
   ↓
trusted ResumeVersion
```

If the local model produces unsupported candidate data, CV Engine removes or blocks it rather than treating it as truth.

## Troubleshooting

### Local AI unavailable

```bash
docker compose ps
docker compose logs ollama ollama-init
```

Verify the configured model:

```bash
docker compose exec ollama ollama list
```

### First request is slow

The first model load is expected to be slower. Ollama keeps the selected model warm for subsequent requests.

### Not enough memory

Use a smaller compatible model explicitly, for example:

```env
OLLAMA_MODEL=qwen3:4b
```

Then restart the stack. For the release baseline, `qwen3:8b` remains the default evaluation target.

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

The model itself is not trusted by configuration. The existing evidence and provenance layers remain the release authority.
