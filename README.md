# icenova

A lightweight temporary landing page for icenova, combining a scroll-led product introduction with a searchable store locator.

## Preview locally

Serve the `docs` directory with any static web server, then open `index.html` in a browser.

## Store data

The Google Sheet `Stores` tab is the master store list. `.github/workflows/sync-stores.yml` checks the published CSV every 15 minutes, validates its headers and rows, and regenerates `docs/store-data.js` only when the active store list changes.

To remove a store from the locator, set its `active` value to `FALSE` rather than deleting or reusing its `store_id`. The sync rejects duplicate IDs, malformed ZIP/state values, missing required fields, and unexpectedly large store-count drops, so the last valid website copy remains available if the Sheet is broken or unavailable.

Run a local validation with:

```text
node scripts/sync-store-data.mjs path/to/published.csv
```

## Hosting

The preview is published with GitHub Pages from the `docs` directory. The production domain will be configured separately.

