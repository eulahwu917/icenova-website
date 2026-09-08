---
title: Mirror site.js custom events to Meta + TikTok pixels
status: draft
class: B
date: 2026-09-08
author: Bepop
context: IceNova - Meta/TikTok pixel install session
supersedes: "not-built decision from pixel-install spec session (David: 'Do it', 2026-09-08 PM)"
---

# Spec: Mirror site.js custom events to Meta + TikTok pixels

## Background

The base pixel install (PR #3, `2110ed1`) fires PageView only. The agency's
media strategy (2026-09-04 ledger) optimizes paid media toward high-intent
actions: store search and directions clicks. `docs/site.js` already emits
those to GA4 via a single `trackEvent` helper (lines 10–12), with call sites:

- `product_view` (line 33, params: `product_name`)
- `store_search` (line 81, params: `searched_area`, `search_status`, `result_count` — no raw query, enforced by tests)
- `directions_click` (line 105, params: `store_city`, `store_state`)

## Change

Modify ONLY the `trackEvent` helper in `docs/site.js` (call sites untouched)
so each event additionally goes to both pixel vendors, with hard failure
isolation per vendor:

1. Meta: `fbq('trackCustom', name, parameters)` — null-safe availability
   check (`typeof window.fbq === "function"`) **wrapped in its own
   try/catch**.
2. TikTok: `ttq.track(name, parameters)` — null-safe availability check that
   tolerates `window.ttq` being null/undefined AND `ttq.track` missing,
   **wrapped in its own try/catch**.
3. The existing GA4 dispatch (line 11) stays first and unchanged. This spec
   does NOT modify or claim to fix the pre-existing GA4 guard.

Why the try/catch is load-bearing, not boilerplate: a typeof guard only
prevents calls on an ABSENT SDK — it neither catches an exception thrown by a
callable SDK nor tolerates `window.ttq = null`. And dispatch happens at
breakable points: `product_view` fires at initial load (site.js:33/44, before
submit-handler registration at :70), and `store_search` dispatches BEFORE
results rendering (:81–85 → :86–96). An uncaught vendor exception there
breaks product scenes and the store-search results UI.

Required behavior: failure of either vendor dispatch (absent, null, or
throwing SDK) must never prevent the other vendor's dispatch, the GA4
dispatch, or the page behavior at any call site. The vendor queues (fbq
stub, ttq.setAndDefer) make early calls safe; no load-order handling needed.

Uniform mirroring of all three events via the shared helper is deliberately
simpler than special-casing two — one code path, no branching.

## Design decision: custom-event names now; optimization mapping is a pending agency decision

Events are mirrored with identical names (`store_search`, `directions_click`,
`product_view`) as custom events. Capability reality (Reviewer-verified
against vendor docs, 2026-09):

- **Meta:** custom events can back custom conversions usable for optimization.
- **TikTok:** custom events support **reporting and audience creation ONLY —
  they are explicitly NOT applicable for campaign optimization** (TikTok
  "About Custom Events" doc; standard events are the optimization path).

Therefore this delivery is scoped honestly: for Meta it enables optimization;
for TikTok it is measurement/audience collection ONLY. Using the mirrored
data for TikTok campaign optimization requires an agency-owned
standard-event mapping (e.g. Meta `Search`/`FindLocation`, TikTok
`Search`/`ClickButton`) as a PENDING PREREQUISITE — recorded here and to be
raised with the agency; it is not implemented in this change. Do NOT rename
GA4 events to implement vendor mappings; a later mapping is a small
helper-level change at the vendor dispatch, while a premature mapping table
is spec + test surface now.

## Privacy posture (must hold)

Mirrored params are the existing minimized application parameters GA4 already
receives (`product_name`, normalized `searched_area`, categorical
`search_status`, counts, store city/state) — no raw search term, no user
identifiers. Note honestly: GA4's privacy flags govern Google signals only —
they do NOT constrain Meta/TikTok SDK cookies or transport; the privacy
guarantee here is parameter minimization at the dispatch site, nothing more.
The existing test assertions (`doesNotMatch /search_term\s*:/`,
`doesNotMatch /searched_area:\s*query/`) must continue to pass.

## NOT building

- No standard-event remapping (see design decision above).
- No Meta Conversions API / server-side events, no advanced matching changes.
- No consent banner, no GTM, no changes to `index.html` or GA4 config.
- No changes to event names, params, or call-site logic in `site.js`.

## Acceptance criteria

1. Source asserts (extend `tests/analytics.test.mjs`, same static-assert style
   as existing tests): `trackEvent` dispatches to GA4 + Meta (`trackCustom`)
   + TikTok (`ttq.track`); each NEW vendor dispatch is independently
   try/catch-wrapped with a null-safe availability check; all three existing
   event call sites and the no-raw-query assertions still pass.
2. **Executable fault-injection check (in addition to static asserts):** a
   small Node test loads `docs/site.js` in a controlled context
   (`node:vm`) and exercises `trackEvent` with (a) `fbq`/`ttq` absent,
   (b) `window.ttq = null`, (c) each vendor function throwing independently,
   asserting in every case: no exception propagates, the OTHER vendor's
   dispatch is still attempted, GA4 dispatch still runs, and (for the
   store-search path) results still render. Static presence assertions alone
   do not close this criterion.
3. `git diff main <branch> --stat` touches ONLY `docs/site.js` and
   `tests/analytics.test.mjs`; `node --test tests/*.test.mjs` passes with the
   extended assertions.
4. **Behavioral smoke on the PR branch (headed browser — Meta suppresses
   /tr under headless; xvfb-run + playwright chromium):** serve `docs/`,
   perform a real store search (fill input, submit) and click a Directions
   link; observe (a) no JS console errors, (b) Meta `/tr` request(s)
   carrying the custom event name(s) (`ev=store_search`, `ev=directions_click`)
   after the baseline PageView, (c) TikTok post-load `api/v2/pixel` requests
   whose inspectable payload references the mirrored event names — a bare
   request-count increase is transport evidence only and insufficient on its
   own, (d) GA4 collect request(s) specific to the actions (not just baseline
   PageView). Both action names plus `product_view` (fires on load) must be
   evidenced. Vendor dashboard acceptance remains a separate human step.
5. Post-merge (Bepop): behavioral smoke re-run against production
   icenovausa.com; Events Managers remain ground truth for whether events
   render (vendor-side human step with Christine/Cory, reported as pending
   if no dashboard access).

## Verification & rollback

- Reviewer verifies diff, guard placement, and scope discipline pre-merge.
- Bepop runs the independent behavioral smoke on the branch before merge and
  re-runs it against production post-merge.
- Rollback = single revert commit; Pages redeploys automatically.
