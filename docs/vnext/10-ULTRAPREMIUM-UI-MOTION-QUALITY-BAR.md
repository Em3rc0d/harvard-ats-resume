# CV Engine vNext — Ultrapremium UI / Motion Quality Bar

Status: **AUTHORITATIVE FRONTEND / POLISH QUALITY SPEC**

## Purpose

This document preserves the frontend quality prompts that will be applied after the functional frontend architecture is stable. They define the expected design and motion bar for CV Engine vNext.

These are not permissions to sacrifice accessibility, performance, clarity, or product truth. Motion and polish must support the product rather than hide state, delay interaction, or obscure important trust information.

## Motion quality suite — $22K movement bar

### 1 — Complete ultra-fluid site creator

> Act as a specialist in animated websites at a $22,000 quality level. I want the CV Engine experience to have exactly the kind of fluid motion quality premium motion-design studios charge for, where every animation feels like carefully choreographed liquid movement rather than a mechanical transition. Create the experience completely.

### 2 — Ultra-fluid scrolling creator

> Act as a specialist in fluid motion and scrolling. I want scrolling in CV Engine to feel like dragging a finger through water, with momentum so smooth that navigation feels physically satisfying while remaining precise, responsive, and accessible.

### 3 — Choreographed entrance director

> Act as a specialist in choreographed element entrances. I want each content element in CV Engine to enter with a soft and distinctive motion, so no two elements need to enter identically, while all entrances share one elegant motion language.

### 4 — Perfectly fluid transition animator

> Act as a specialist in fluid transitions between views/sections. I want visual continuity between product states, with elements transforming or handing off gracefully rather than disappearing through abrupt mechanical changes.

### 5 — Motion-blur realism creator

> Act as a specialist in motion realism. Where technically and perceptually appropriate, fast animation may use subtle motion-blur-like treatment so movement feels weighted and physical rather than artificially sharp or mechanical. Never use this in a way that harms readability or accessibility.

### 6 — Rhythm and velocity composer

> Act as a specialist in animation rhythm. I want the overall pacing of CV Engine's animations to use deliberate fast/slow contrast and create visual musicality without becoming distracting, slow, or theatrical.

## Ultrapremium product UI suite — $45K quality bar

### 1 — Complete ultrapremium web application builder

> Act as a specialist in ultrapremium web applications at a quality equivalent to a $45,000 elite studio engagement. Every pixel of CV Engine should demonstrate exceptional craft and users should be able to perceive the quality of the experience immediately.

### 2 — Visual hierarchy architect

> Act as an elite specialist in visual hierarchy. Structure CV Engine so the user's attention naturally follows the intended product story, trust states, calls to action, evidence hierarchy, and decisions without feeling manipulated.

### 3 — World-class interaction creator

> Act as a world-class interaction-design specialist. Every interactive element should respond with carefully designed motion and feedback so buttons, forms, cards, navigation, review actions, and product state changes feel intentional and satisfying.

### 4 — $45K typography system

> Act as an elite typography-system specialist. Build a complete CV Engine typography system with precise title hierarchy, readable line lengths, spacing relationships, responsive scales, dense-data handling, and typography that functions as a visual-design system rather than merely text styling.

### 5 — Content-reveal animation system

> Act as a specialist in premium content-reveal animations. Content should appear through coordinated sequences with deliberate timing and rhythm, while important evidence, warnings, errors, and decisions remain immediately understandable.

### 6 — Pixel-level detail refinement

> Act as a specialist in pixel-level refinement. Every microdetail in CV Engine should be polished so a professional designer can inspect spacing, alignment, sizing, states, borders, icons, shadows, surfaces, responsive behavior, and interaction feedback without finding careless placement or inconsistent treatment.

### 7 — Premium mobile optimization

> Act as an elite mobile-quality specialist. Every world-class interaction and refined desktop detail must retain equivalent quality on phones, since mobile may be the user's first impression. Mobile must not be a compressed desktop layout; it requires intentional hierarchy, touch targets, motion, forms, review flows, and responsive density.

## Application order

These prompts are applied after the trusted functional frontend is coherent:

```text
Product contract
  ↓
Functional UX
  ↓
Responsive frontend
  ↓
Accessibility baseline
  ↓
Visual system / typography / hierarchy
  ↓
Interaction design
  ↓
Motion language
  ↓
Performance profiling
  ↓
Pixel polish
  ↓
Mobile certification
```

Do not start with animation before product state and information architecture are correct.

## Non-negotiable constraints

The ultrapremium layer must not:

- delay critical user actions for decorative animation;
- hide errors, warnings, degraded states, evidence provenance, or security notices;
- reduce keyboard accessibility;
- violate `prefers-reduced-motion`;
- introduce scroll hijacking that makes navigation unpredictable;
- cause layout shift or poor Core Web Vitals without a justified tradeoff;
- animate secrets or sensitive data into persistent DOM/history/log artifacts;
- turn the product into a marketing landing page when the user is performing work;
- overuse 3D, blur, parallax, or morphing where clarity should dominate.

## Performance / accessibility requirements

Every premium-motion feature must have:

- reduced-motion behavior;
- mobile behavior;
- keyboard/focus behavior where interactive;
- cancellation/interruption behavior;
- frame-rate/performance check on representative hardware;
- fallback when advanced effects are unsupported.

Prefer GPU-friendly transforms/opacity when possible. Avoid expensive full-page filters and uncontrolled continuous animation.

## Definition of done

The frontend polish phase is complete when CV Engine feels premium in both still frames and motion, but a user can still complete the core task quickly and clearly with motion reduced or disabled.

The design goal is not "more animation." It is **high perceived craft, coherent motion, clear hierarchy, and satisfying interaction without compromising trust or usability**.
