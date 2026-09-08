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
so each event additionally goes to both pixel vendors:

1. Meta: `fbq('trackCustom', name, parameters)` — guarded by
   `typeof window.fbq === "function"`.
2. TikTok: `ttq.track(name, parameters)` — guarded by
   `typeof window.ttq !== "undefined" && typeof window.ttq.track === "function"`.
3. The existing GA4 dispatch (line 11) stays first and unchanged.

Each vendor call wrapped in its own guard so an ad blocker / failed SDK load
can never throw inside the store-search submit or directions-click handlers
(a throw there breaks rendering of results — the error handling is the point,
not boilerplate). The vendor queues (`fbq` stub, `ttq.setAndDefer`) make
early calls safe; no load-order handling is needed.

Uniform mirroring of all three events via the shared helper is deliberately
simpler than special-casing two — one code path, no branching.

## Design decision: custom-event names, not standard-event mapping

Events are mirrored with identical names (`store_search`, `directions_click`,
`product_view`) as custom events. Mapping to vendor standard events (Meta
`Search`/`FindLocation`, TikTok `Search`/`ClickButton`) is a semantic decision
the agency should own from their dashboards; renaming fires later is a
one-line change, while a premature mapping table is spec + test surface now.
Custom conversions can be built on custom events in both platforms.

## Privacy posture (must hold)

Mirrored params are the already-anonymized GA4 params: geographic buckets and
counts only — no raw search term, no user identifiers. The existing test
assertions (`doesNotMatch /search_term\s*:/`, `doesNotMatch /searched_area:\s*query/`)
must continue to pass. GA4's privacy flags are untouched.

## NOT building

- No standard-event remapping (see design decision above).
- No Meta Conversions API / server-side events, no advanced matching changes.
- No consent banner, no GTM, no changes to `index.html` or GA4 config.
- No changes to event names, params, or call-site logic in `site.js`.

## Acceptance criteria

1. Source asserts (extend `tests/analytics.test.mjs`, same static-assert style
   as existing tests): `trackEvent` dispatches to GA4 + Meta (`trackCustom`)
   + TikTok (`ttq.track`); each vendor dispatch is guard-wrapped; all three
   existing event call sites and the no-raw-query assertions still pass.
2. `git diff main <branch> --stat` touches ONLY `docs/site.js` and
   `tests/analytics.test.mjs`.
3. `node --test tests/*.test.mjs` passes with the extended assertions.
4. **Behavioral smoke on the PR branch (headed browser — Meta suppresses
   beacons under headless; xvfb-run + playwright chromium):** serve `docs/`,
   perform a real store search (fill input, submit) and click a Directions
   link; observe (a) no JS console errors, (b) Meta `/tr` request(s) carrying
   the custom event name(s) after the baseline PageView, (c) TikTok
   `api/v2/pixel` request count increases after the actions vs baseline,
   (d) GA4 gtag collect request(s) still fire.
5. Post-merge (Bepop): behavioral smoke re-run against production
   icenovausa.com; both Events Managers remain the ground truth for whether
   events render (vendor-side human step with Christine/Cory, reported as
   pending if no dashboard access).

## Verification & rollback

- Reviewer verifies diff, guard placement, and scope discipline pre-merge.
- Bepop runs the independent behavioral smoke on the branch before merge and
  re-runs it against production post-merge.
- Rollback = single revert commit; Pages redeploys automatically.
