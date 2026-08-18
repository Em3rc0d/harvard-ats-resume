# ATS v2 — Trust-first UX Polish

## Purpose

This pass aligns the visible CV Engine experience with the trust boundaries already enforced by ATS v2 and Market v0.1.

The UI must not promise outcomes the system cannot know or guarantee. It must also make safety stops understandable instead of exposing internal pipeline messages as product copy.

## Responsible-use entry gate

Every fresh page load opens a blocking responsible-use disclaimer before the user can interact with the product.

The disclaimer states that CV Engine:

- helps organize career evidence, improve presentation and analyze opportunities;
- does **not** guarantee ATS ranking, interviews, offers or employment;
- must not be used to fabricate experience, education, identity, credentials, metrics or achievements;
- requires the user to review material facts before submitting an application.

The disclaimer is product guidance, not a claim that all legal/compliance obligations are satisfied by the modal itself.

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

The legacy form buttons still use `NEXT_PUBLIC_N8N_OPTIMIZE_URL`. The repository already remaps that variable to `/api/optimize-content`, but the endpoint performed presentation-only normalization. Clean text could therefore return unchanged and make the button appear broken while the UI still described the action as AI optimization.

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
- new domain/factual vocabulary outside a small multilingual connective/style vocabulary;
- unsafe expansion beyond the presentation budget.

This is deliberately conservative because inline form text later becomes candidate-supplied career data. A model suggestion must not silently bypass the final resume grounding boundary.

### Important boundary

```text
InlineOptimization != NewCareerFactAuthority
```

If the proposed rewrite cannot be proven presentation-safe, CV Engine keeps the source-safe text instead of accepting a stronger claim.

## Visual system

The landing surface now uses:

- translucent depth layers and softer card hierarchy;
- a CSS-only 3D career-intelligence scene;
- evidence/target/market/decision visual nodes;
- restrained entrance and hover transitions;
- `prefers-reduced-motion` fallbacks;
- stronger focus states and modal semantics.

No decorative graphic represents a real score, probability or live market signal.
