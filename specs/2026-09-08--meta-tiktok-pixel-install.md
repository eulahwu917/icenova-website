---
title: Meta + TikTok pixel base-code install on icenova-website
status: approved-locked
class: B
date: 2026-09-08
author: Bepop
context: IceNova - Meta/TikTok pixel install session
approvals: R1 t_e37ea612 (NOT_APPROVED, 1 blocker) → R2 t_1bd9bc52 APPROVED at ac7e97a; residuals patched in same pass
---

# Spec: Meta + TikTok pixel base-code install on icenova-website

## Background

Christine Nguyen (Asifoo social media manager) sent pixel IDs via two emailed
PDF screenshots, dropped in `/srv/personal/inbox-desktop/icenova website pixel/`.
IDs were OCR-extracted and cross-verified against the vendor code snippets shown
in the same emails:

| Pixel | ID | Provenance (verified occurrences) |
|---|---|---|
| Meta (Facebook) | `1785155876048905` | 3x: "Meta Pixel ID" headline p.1, then `fbq('init', …)` and the noscript img URL p.2. Sources retained at `/srv/personal/inbox-desktop/icenova website pixel/` (`Meta PixelID.pdf`, `TikTok PixelID.pdf`). |
| TikTok | `DAG7S7JC77U70STH6QGG` | 2x: "TikTok Pixel ID" headline p.1, `ttq.load('…')` base code p.2 |

Strategy context (2026-09-04 daily ledger): agency advised optimizing for
high-intent actions; Meta Pixel was an explicit prerequisite. Google Analytics
is handled by ISO directly (David, 2026-09-08) — GA4 `G-VQJ6B4Z2NM` stays
untouched.

## Current state

- `docs/index.html` (122 lines), single-page static site served from `docs/` on
  GitHub Pages; deploy on push to `main` via `.github/workflows/deploy-pages.yml`.
- Existing analytics: GA4 gtag snippet at lines 30–40 (keep as-is, first in order).
- `docs/site.js` fires custom GA4 events (`product_view`, `store_search`,
  `directions_click`) — out of scope here.

## Change

Insert two vendor base-code blocks in `docs/index.html`:

1. `<!-- Meta Pixel Code -->` … `<!-- End Meta Pixel Code -->` — Meta pixel
   base `<script>` (standard Meta base code: `!function(f,b,e,v,n,t,s){…}`
   loader, `fbq('init', '1785155876048905')`, `fbq('track', 'PageView')`),
   placed in `<head>` immediately after the GA4 `</script>` (currently line 40,
   before the `store-data.js` include at line 41).
2. Meta `<noscript>` fallback `<img>` with
   `https://www.facebook.com/tr?id=1785155876048905&ev=PageView&noscript=1` —
   placed immediately inside `<body>` (currently opens at line 47) so the img
   is HTML-valid; head placement of the base script follows Meta's published
   install guide.
3. `<!-- TikTok Pixel Code -->` … `<!-- End TikTok Pixel Code -->` — TikTok
   pixel base code (standard TikTok loader IIFE with
   `ttq.load('DAG7S7JC77U70STH6QGG')` and `ttq.page()`), in `<head>` after the
   Meta block.

Each block carries a one-line provenance comment (`installed 2026-09-08, ID
from Christine Nguyen / Cory Henke email`). Exact snippet text is the vendors'
current published base code — Developer copies from the official sources, not
from memory, and the ID strings must be byte-exact as listed above.

## NOT building

- No event code beyond the vendors' automatic PageView (no `trackCustom`
  mirroring of `site.js` events — follow-up spec if David wants it).
- No consent/cookie banner, no GTM, no refactoring of the GA4 snippet.
- No changes to `site.js`, `styles.css`, store-data pipeline, or workflows.
- No Google Ads tag (GA handled by ISO; Ads tag is a separate open item).

## Acceptance criteria

1. Occurrence check on `docs/index.html` (literal `grep -Fo | wc -l`, not
   `grep -c`, which counts lines): exactly 1 occurrence each of
   `fbq('init', '1785155876048905')`, `1785155876048905&ev=PageView`,
   `ttq.load('DAG7S7JC77U70STH6QGG')`, `fbq('track', 'PageView')`, and
   `ttq.page()`.
2. GA4 block (lines 30–40) byte-identical to `main` — all three privacy flags
   intact; `git diff main <branch> --stat` touches ONLY `docs/index.html`.
3. **Behavioral smoke (required for 'done', not just source-presence):** serve
   `docs/` locally, load the page in a clean browser context (blockers
   disabled), confirm zero new JavaScript console errors, and observe via
   network log / vendor debug tool that BOTH pixel endpoints are actually
   requested for that visit (Meta `fbevents.js` + `/tr` PageView hit, TikTok
   `events.js?sdkid=<ID>&lib=ttq` + its collect hit) — one PageView each, no
   duplicates. Source-retrieval alone does not close this criterion.
4. Vendor-side activation (Christine/Cory, human step, outside this repo):
   both pixels show Active in Events Manager for a fresh visit from
   icenovausa.com within ~20 min of deploy. Remains pending-owned by them;
   absence of dashboard access is reported as pending, never claimed from
   curl output.
5. Post-merge live checks (Bepop verification, not Developer): live
   `https://icenovausa.com/` serves both snippets; behavioral smoke (criterion
   3) repeated against production; if retained, any SDK reachability HEAD
   check uses the URL actually emitted by the copied loader (TikTok loader
   emits `?sdkid=<ID>&lib=ttq`, not `?pixel_id=<ID>`) and requires an
   explicit HTTP 2xx — a timeout is reported as unverifiable, not as pass.

## Verification & rollback

- Reviewer verifies the diff (IDs char-exact vs provenance table, placement,
  diff-scope) before merge.
- Bepop runs independent post-checks (test steps 4–5) before reporting done.
- Rollback = single revert of the merge commit; Pages redeploys automatically.
