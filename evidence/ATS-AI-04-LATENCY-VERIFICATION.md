# ATS-AI-04 — Local AI Latency Verification

## Status

Repository gate: **GREEN**.

Final branch head: `cded9bffefb4d5180af1c5b9d11705cbaf332c54`.

Field acceptance: **PENDING final Docker replay** of the same real resume and target workflow.

## Field evidence 01 — monolithic resume import was not viable on CPU

Observed on the Docker CPU host:

- model: `qwen3:8b`
- whole-resume structured extraction request
- output throughput: roughly `1.8 tokens/s`
- trusted import budget: `180000 ms`
- request timed out after only roughly 304 decoded tokens

Conclusion: increasing the timeout would only lengthen the failure. Import was redesigned as deterministic section splitting plus bounded structured extraction with `qwen3:1.7b`.

## Field evidence 02 — whole-resume generation was not viable on CPU

After import v3 was introduced, the next real workflow exposed a separate bottleneck in final resume generation:

- model: `qwen3:8b`
- model size reported by the local runtime: ~8.19B parameters / ~4.86 GiB GGUF
- context window: `16384`
- KV cache: ~2304 MiB
- prompt size: `2151` tokens
- prompt processing after `140.68 s`: only `1024` tokens processed
- prompt throughput: roughly `7.28 tokens/s`
- final generation budget: `240000 ms`
- result: `REQUEST_TIMEOUT` before useful resume decoding completed

At the observed prompt rate, the prompt alone required roughly five minutes to ingest. Increasing the timeout was therefore rejected as an architectural non-fix.

## Final runtime decision

Whole-resume LLM generation is no longer part of the trusted critical path.

```text
Career Evidence
      ↓
Generation Readiness
      ↓
Durability Preflight
      ↓
Deterministic source-preserving resume assembly
      ↓
Grounding
      ↓
Semantic Grounding
      ↓
Claim Composition / Provenance
      ↓
Durable ResumeVersion
```

Ollama remains for bounded workloads only:

```text
Resume import      → qwen3:1.7b, section-scoped
Inline Optimize    → qwen3:4b-instruct, field-scoped
Final assembly     → deterministic application-owned composer, zero model calls
```

Docker no longer requires or pulls `qwen3:8b` for the release path. Docker uses an isolated `8192` context window for bounded local workloads so stale host configuration cannot restore the previous 16K CPU/KV-cache profile.

## Regression contract

The behavior suite explicitly replaces `globalThis.fetch` with a function that throws and then runs final resume assembly twice. The test requires:

- both assemblies succeed;
- output is deterministic;
- `fetch` is never called;
- candidate source casing and facts are preserved;
- target Job Description text never appears as candidate truth;
- deterministic generation metadata is emitted.

This prevents a future refactor from silently putting full-resume Ollama inference back on the final generation critical path.

## Authoritative CI

Code-bearing head before this evidence receipt:

`91061755217fbc0d2b59186b41dae9cc8261b5cf`

Initial complete green run for that code head:

- run: `32438756220`
- job: `96645068827`

The evidence receipt then advanced the branch without modifying runtime code. The resulting final branch head was independently run through the same complete CI gate:

Final branch head:

`cded9bffefb4d5180af1c5b9d11705cbaf332c54`

Final GitHub Actions verification:

- run: `32439009529`
- job: `96645802965`

All gates passed on the final branch head:

- dependency install
- dependency audit
- local-only AI enforcement
- lint
- typecheck
- behavior tests
- production build
- PDF.js server-runtime verification
- Docker Compose topology validation
- CV Engine Docker image build
- browser acceptance runtime installation
- browser acceptance

## Remaining field acceptance

Replay the same real Docker workflow on the final branch state.

Expected runtime evidence:

1. `ollama-init` ensures/preloads `qwen3:1.7b` for import and can ensure `qwen3:4b-instruct` for bounded inline optimization.
2. Docker does **not** need to load `qwen3:8b` for final resume generation.
3. Import reports `native-text-ollama-v3-sectioned` and retains source reconciliation/completeness gates.
4. Final resume generation does **not** create an Ollama `/api/chat` request.
5. No `Local AI resume provider failure` or `REQUEST_TIMEOUT` can arise from final assembly.
6. Grounding, semantic grounding, claim provenance and durable `ResumeVersion` creation still execute normally after deterministic assembly.
