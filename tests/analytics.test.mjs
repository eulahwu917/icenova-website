import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("publishes the configured GA4 measurement ID with ad personalization disabled", async () => {
  const html = await readFile(new URL("docs/index.html", root), "utf8");
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-VQJ6B4Z2NM/);
  assert.match(html, /gtag\("config", "G-VQJ6B4Z2NM"/);
  assert.match(html, /allow_google_signals:\s*false/);
  assert.match(html, /allow_ad_personalization_signals:\s*false/);
  assert.match(html, /ads_data_redaction:\s*true/);
});

test("tracks grouped store demand without sending the raw query", async () => {
  const script = await readFile(new URL("docs/site.js", root), "utf8");
  assert.match(script, /trackEvent\("store_search"/);
  assert.match(script, /searched_area:\s*normalizeSearchArea/);
  assert.match(script, /search_status:/);
  assert.match(script, /result_count:/);
  assert.doesNotMatch(script, /search_term\s*:/);
  assert.doesNotMatch(script, /searched_area:\s*query/);
  assert.match(script, /trackEvent\("directions_click"/);
  assert.match(script, /trackEvent\("product_view"/);
});

