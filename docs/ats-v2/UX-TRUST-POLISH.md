# ATS v2 — Trust-first UX Polish

## Status

`IMPLEMENTED — pending final documentation-head CI and merge`

## Purpose

This pass aligns the visible CV Engine experience with the trust boundaries already enforced by ATS v2 and Market v0.1.

The UI must not promise outcomes the system cannot know or guarantee. It must also make safety stops understandable instead of exposing internal pipeline messages as product copy.

## Responsible-use entry gate

Every fresh page load opens a blocking responsible-use disclaimer before the user can interact with the product.

The disclaimer states that CV Engine:

- helps organize career evidence, improve presentation and analyze opportunities;
- does **not** guarantee ATS ranking, interviews, offers or employment;
- must not be used to fabricate experience, education, identity, credentials, metrics or achievements;
- requires the user to review material facts before submitting an application;
- is intended for lawful, honest and responsible use.

The disclaimer is product guidance and a clear allocation of user responsibility. It is **not** represented as a complete legal/compliance program or a guarantee that the modal alone resolves every jurisdictional obligation.

## Landing-page truth contract

The previous marketing-first language is replaced on the primary landing surface by a trust-first message:

```text
career evidence
+ career target
+ source-aware market context
→ explainable decisions
→ resume projection
```

The landing page does not claim hiring probability or guaranteed ATS success.

The primary visual is intentionally conceptual. The CSS-only 3D evidence/target/market/decision scene does not render a score, probability or live market measurement.

## Grounding-recovery UX

A generation grounding or semantic-grounding failure remains a hard stop.

The visible experience now:

- presents a concise localized explanation;
- shows at most five items first;
- keeps the complete list behind a disclosure;
- hides raw technical error text behind a separate technical-detail disclosure;
- does not render the prior Target/Generation screen underneath the guardrail;
- routes the user back to editing career evidence when correction is appropriate.

The underlying truth rule is unchanged:

```text
MissingEvidence != InventedEvidence
UnsupportedGeneratedClaim != CandidateFact
```

## Inline `Optimize & Improve` repair

### Root cause

The legacy form buttons still use the compatibility variable `NEXT_PUBLIC_N8N_OPTIMIZE_URL`. `next.config.js` already remaps that variable to the internal `/api/optimize-content` endpoint, so the browser was not calling n8n. The internal endpoint, however, performed presentation-only normalization. Clean text could therefore return unchanged and make the button appear broken while the UI still described the action as AI optimization.

The repair keeps the compatibility variable so existing form wiring does not break, but the runtime authority is the internal CV Engine endpoint.

### New contract

The internal endpoint now uses a constrained Gemini rewrite proposal followed by a deterministic application guard.

```text
candidate-authored source text
        ↓
constrained rewrite proposal
        ↓
deterministic fact-preservation guard
        ├── safe → apply rewrite
        └── unsafe/unavailable → presentation-only fallback
```

The guard rejects proposals that introduce:

- numeric facts absent from the source;
- URLs or email addresses absent from the source;
- new domain/factual vocabulary;
- new responsibility/action verbs absent from the source;
- unsafe expansion beyond the presentation budget.

Only a deliberately small multilingual **grammar/connective** vocabulary may be introduced. Action verbs, ownership, scope qualifiers, technologies, outcomes and responsibility language must already exist in candidate-authored text.

Examples:

```text
source:   "Trabajo Spring Boot MongoDB APIs REST."
proposal: "Trabajo con APIs REST, Spring Boot y MongoDB."
result:   ALLOWED
```

```text
source:   "Apoyé el desarrollo de APIs REST con Spring Boot."
proposal: "Lideré el desarrollo de APIs REST con Spring Boot."
result:   REJECTED → source-safe fallback
```

This is deliberately conservative because inline form text later becomes candidate-supplied career data. A model suggestion must not silently bypass the final resume grounding boundary.

### User-visible result states

The form no longer silently returns the same field value.

```text
safe rewrite changed text
→ success feedback

safe rewrite produced no semantic/presentation change
→ explicit no-change feedback

model unavailable or proposal rejected by fact guard
→ source-safe text retained + explicit fallback feedback
```

The previous hints that promised "ATS-optimized" wording or generically pushed the user to add quantifiable metrics were removed. The form now says that metrics should be used only when true and verifiable.

Target mode also states explicitly that a vacancy can be compared against career evidence but cannot create candidate skills or facts.

### Important boundary

```text
InlineOptimization != NewCareerFactAuthority
JobDescription != CandidateFactAuthority
MissingMetric != PermissionToInventMetric
```

If the proposed rewrite cannot be proven presentation-safe, CV Engine keeps the source-safe text instead of accepting a stronger claim.

## Visual system

The landing and form surfaces now use:

- translucent depth layers and softer card hierarchy;
- a CSS-only 3D career-intelligence scene;
- evidence/target/market/decision visual nodes;
- restrained entrance and hover transitions;
- `prefers-reduced-motion` fallbacks;
- stronger focus states and modal semantics;
- more consistent rounded controls, progress treatment and form hierarchy.

No decorative graphic represents a real score, probability or live market signal.

## Validation history

The first draft CI exposed three useful regressions:

1. a stale abuse-guard test still expected direct presentation normalization in the route;
2. a stale runtime-hardening test still encoded the old "no generative AI" architecture;
3. punctuation tokenization treated `REST.` and `REST` as different factual tokens.

Those were corrected by preserving the original security intent and updating the architecture assertions to require:

- rate limiting before any model-backed rewrite;
- internal-only optimizer routing;
- deterministic fact-preservation validation;
- no Job Description, CareerTarget, JobRequirement or MatchReport inputs in the optimizer route;
- presentation-only fallback when rewrite safety cannot be proven.

A later production build correctly rejected an unsupported Tailwind `bg-white/72` utility inside `@apply`; the visual token was changed to a supported opacity utility.

### Green implementation head

```text
head
6d2f81e7421ded202f10caa3b11c1b53089be526

CI run
32099951409

CI job
95598408599

Install             PASS
Dependency audit    PASS — 0 vulnerabilities
Lint                PASS — zero warnings
Typecheck           PASS
Behavior tests      PASS — 250 tests
Production build    PASS
```

The additional optimizer regressions include rejection of unsupported numbers, URLs, email addresses, new technologies/domain vocabulary and stronger responsibility verbs.

## Browser-preview evidence boundary

No PR preview URL is available in PR #43 comments, and the Vercel project for this repository is not present in the currently connected Vercel team. Therefore this pass does **not** claim browser-level preview verification.

What is verified is:

- source-level UI composition;
- accessibility-oriented modal/focus/reduced-motion contracts;
- TypeScript and ESLint correctness;
- complete ATS v2 behavior regression suite;
- optimized Next.js production build.

A live/preview visual inspection should only be claimed once a deployment for this exact head is accessible.
