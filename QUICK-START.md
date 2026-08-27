# CV Engine — Quick Start

CV Engine uses a **local Ollama runtime for bounded assistance** and a deterministic trusted core for final resume materialization. No remote LLM API key is required for the default stack.

## Recommended: one-command Docker stack

### Prerequisites

- Docker Desktop / Docker Engine with Docker Compose v2
- Sufficient disk for application layers and the configured local Ollama models
- Sufficient memory for one configured local model at a time

The shipping runtime uses workload-specific behavior:

- `qwen3:1.7b` — bounded resume-import extraction where deterministic source recovery is not sufficient
- `qwen3:4b-instruct` — bounded inline wording optimization
- **no model call** — final resume assembly is deterministic and application-owned

The Docker Ollama service defaults to one loaded model at a time.

### Start everything

```bash
cp .env.example .env
docker compose up --build
```

The first start downloads the configured bounded-workload models into the persistent `ollama-data` volume. Later starts reuse them. The bootstrap preloads the import model because resume import is normally the first model-backed user action.

Open:

```text
http://localhost:3000
```

Runtime health:

```text
http://localhost:3000/api/health
```

Health distinguishes trusted-core durability from optional AI capability. Durable Redis is trusted-core and fails closed. Local AI may degrade an affected optional/bounded capability without becoming a candidate-truth authority.

### NVIDIA GPU acceleration

When Docker can access an NVIDIA GPU:

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Do not infer another host/runtime is supported merely because it starts successfully. Runtime support remains evidence-bound to the qualified profile/fingerprint.

## Local inference policy

Default workload configuration:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:1.7b
OLLAMA_IMPORT_MODEL=qwen3:1.7b
OLLAMA_OPTIMIZE_MODEL=qwen3:4b-instruct
OLLAMA_NUM_CTX=8192
RESUME_IMPORT_TIMEOUT_MS=180000
```

There is no `OLLAMA_RESUME_MODEL` requirement in the trusted final-generation path. Final resume assembly is deterministic.

All model outputs remain **untrusted proposals**. Changing model size or timeout never bypasses source reconciliation, grounding, semantic grounding, claim provenance, or durable Career Vault integrity.

## What Docker starts

```text
Browser
  ↓
CV Engine / Next.js :3000
  ├─→ Ollama :11434
  │      ├─ qwen3:1.7b         bounded import extraction
  │      └─ qwen3:4b-instruct  inline wording optimization
  │
  ├─→ deterministic resume composer
  │      └─ no whole-resume model request
  │
  └─→ Upstash-compatible Redis HTTP proxy
            ↓
          Redis
            └─ persistent data volume
```

Services:

- `app` — CV Engine
- `ollama` — local inference server for bounded AI capabilities
- `ollama-init` — pulls configured models and preloads the import model
- `redis` — durable local Redis
- `redis-http` — Upstash-compatible REST facade used by durable repositories

## Useful commands

```bash
# Start / build
docker compose up --build

# Follow logs
docker compose logs -f app ollama redis redis-http

# See installed models
docker compose exec ollama ollama list

# See currently loaded model / CPU-GPU placement
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
ollama pull qwen3:1.7b
ollama pull qwen3:4b-instruct
npm run dev
```

Default host Ollama URL:

```env
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

Trusted durable flows still require `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` when the application is not using the Docker Compose local Redis stack.

## Trusted flow

```text
Resume PDF/DOCX
   ↓
server-side text extraction
   ↓
deterministic source recovery where possible
   ↓
bounded qwen3:1.7b extraction only where needed
   ↓
source reconciliation
   ↓
Career Evidence review
   ↓
optional Job / Career Target
   ↓
deterministic source-preserving resume assembly
   ↓
grounding + semantic grounding
   ↓
claim provenance
   ↓
durable Career Vault commit + reload verification
   ↓
trusted ResumeVersion
```

If a local model proposes unsupported candidate data, CV Engine removes or blocks it rather than treating it as truth.

## Troubleshooting

### Resume import reaches `RESUME_IMPORT_TIMEOUT`

A timeout means an import extraction boundary exceeded its bounded inference window. It does **not** authorize accepting partial or unsupported candidate data.

Inspect model placement:

```bash
docker compose exec ollama ollama ps
```

Inspect application/Ollama logs:

```bash
docker compose logs --tail=200 app ollama
```

The shipping Docker import model is `qwen3:1.7b`, with a default outer import budget of 180 seconds plus bounded section-level behavior. Do not solve a timeout by weakening reconciliation.

### Local AI unavailable

```bash
docker compose ps
docker compose logs ollama ollama-init
```

Verify configured models:

```bash
docker compose exec ollama ollama list
```

Manual Career Evidence and deterministic trusted-core behavior must not silently invent facts because a bounded AI helper is unavailable.

### First model-backed request is slow

A first model load can be slower than a warm request. `ollama-init` preloads the import model and persistent volumes avoid re-downloading model weights on ordinary restarts.

### Durable storage unavailable

Inspect:

```bash
docker compose logs redis redis-http
```

The Docker stack intentionally fails trusted durable operations closed instead of claiming Career Vault data was saved when Redis is unavailable.

### Browser opened through a non-loopback HTTP address

Some browser APIs differ between `localhost` and ordinary HTTP origins such as a Windows browser reaching a WSL IP. CV Engine's Career Vault capability must not assume `crypto.randomUUID()` exists; the release browser regression exercises the `crypto.getRandomValues()` fallback class.

## Verification before integration

```bash
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test
npm run build
node scripts/verify-pdfjs-server-bundle.mjs
docker compose config
```

CI additionally verifies local-only AI enforcement, exact Docker build identity, and Chromium release acceptance.

The model itself is never the truth authority. Evidence, provenance, deterministic composition, durability, and explicit release receipts remain the authority.
