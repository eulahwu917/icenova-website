---
title: Meta + TikTok pixel base-code install on icenova-website
status: draft
class: B
date: 2026-09-08
author: Bepop
context: IceNova - Meta/TikTok pixel install session
---

# Spec: Meta + TikTok pixel base-code install on icenova-website

## Background

Christine Nguyen (Asifoo social media manager) sent pixel IDs via two emailed
PDF screenshots, dropped in `/srv/personal/inbox-desktop/icenova website pixel/`.
IDs were OCR-extracted and cross-verified against the vendor code snippets shown
in the same emails:

| Pixel | ID | Provenance (verified occurrences) |
|---|---|---|
| Meta (Facebook) | `1785155876048905` | 3x: "Meta Pixel ID" headline p.1, `fbq('init', '…')` base code p.2 (2x) |
| TikTok | `DAG7S7JC77U70STH6QGG` | 2x: "TikTok Pixel ID" headline p.1, `ttq.load('…')` base code p.2 |

Strategy context (2026-09-04 daily ledger): agency advised optimizing for
high-intent actions; Meta Pixel was an explicit prerequisite. Google Analytics
is handled by ISO directly (David, 2026-09-08) — GA4 `G-VQJ6B4Z2NM` stays
untouched.

## Current state

- `docs/index.html` (122 lines), single-page static site served from `docs/` on
  GitHub Pages; deploy on push to `main` via `.github/workflows/deploy-pages.yml`.
- Existing analytics: GA4 gtag snippet at lines 30–38 (keep as-is, first in order).
- `docs/site.js` fires custom GA4 events (`product_view`, `store_search`,
  `directions_click`) — out of scope here.

## Change

Insert two vendor base-code blocks in `docs/index.html`, in this order, all in
`<head>` immediately after the GA4 `</script>` (line 38):

1. Comment marker + Meta pixel base `<script>` (standard Meta base code:
   `!function(f,b,e,v,n,t,s){…}` loader, `fbq('init', '1785155876048905')`,
   `fbq('track', 'PageView')`).
2. Meta `<noscript>` fallback `<img>` with
   `https://www.facebook.com/tr?id=1785155876048905&ev=PageView&noscript=1` —
   placed immediately after the `<body>` open tag (line ~44), per Meta's
   canonical install.
3. Comment marker + TikTok pixel base code (standard TikTok loader IIFE with
   `ttq.load('DAG7S7JC77U70STH6QGG')` and `ttq.page()`).

Each block wrapped in vendor-conventional comments:
`<!-- Meta Pixel Code -->` … `<!-- End Meta Pixel Code -->` and
`<!-- TikTok Pixel Code -->` … `<!-- End TikTok Pixel Code -->`, each with a
one-line provenance comment (`installed 2026-09-08, ID from Christine Nguyen /
Cory Henke email`). Exact snippet text is the vendors' current published base
code — Developer copies from the official sources, not from memory, and the
ID strings must be byte-exact as listed above.

## NOT building

- No event code beyond the vendors' automatic PageView (no `trackCustom`
  mirroring of `site.js` events — follow-up spec if David wants it).
- No consent/cookie banner, no GTM, no refactoring of the GA4 snippet.
- No changes to `site.js`, `styles.css`, store-data pipeline, or workflows.
- No Google Ads tag (GA handled by ISO; Ads tag is a separate open item).

## Acceptance criteria

1. `grep -c "fbq('init', '1785155876048905')"` → exactly 1;
   `grep -c "ttq.load('DAG7S7JC77U70STH6QGG')"` → exactly 1.
2. Facebook noscript `<img>` present once, with the same ID.
3. `git diff main <branch> --stat` touches ONLY `docs/index.html`.
4. Local render: serve `docs/`, fetch `/`, confirm both markers + GA4 still
   present; page HTML still well-formed (no stray tags around the insert).
5. Post-merge (Bepop verification, not Developer): live
   `https://icenovausa.com/` serves both snippets; `curl -sI` on
   `https://connect.facebook.net/en_US/fbevents.js` and TikTok's
   `analytics.tiktok.com/i18n/pixel/events.js?pixel_id=<ID>` both resolve.
6. Vendor-side activation (Christine/Cory, human step, outside this repo):
   both pixels show Active in Events Manager within ~20 min of deploy.

## Verification & rollback

- Reviewer verifies the diff (IDs char-exact vs provenance table, placement,
  diff-scope) before merge.
- Bepop runs independent post-checks (test steps 4–5) before reporting done.
- Rollback = single revert of the merge commit; Pages redeploys automatically.
