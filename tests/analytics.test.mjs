import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

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

test("mirrors custom events to Meta and TikTok pixels with independent null-safe dispatch", async () => {
  const script = await readFile(new URL("docs/site.js", root), "utf8");
  assert.match(script, /typeof window\.fbq === "function"/);
  assert.match(script, /window\.fbq\("trackCustom", name, parameters\)/);
  assert.match(script, /window\.ttq\s*&&\s*typeof window\.ttq\.track === "function"/);
  assert.match(script, /window\.ttq\.track\(name, parameters\)/);
  assert.match(script, /try\s*\{[^]*?window\.fbq\("trackCustom", name, parameters\)[^]*?\}\s*catch/);
  assert.match(script, /try\s*\{[^]*?window\.ttq\.track\(name, parameters\)[^]*?\}\s*catch/);
  assert.match(script, /window\.gtag\("event", name, parameters\)[^]*window\.fbq\("trackCustom", name, parameters\)[^]*window\.ttq\.track\(name, parameters\)/);
});

const STORE_FIXTURES = [
  { name: "Seattle Flagship", banner: "", address: "1 Pike St", city: "Seattle", state: "WA", zip: "98101" },
  { name: "Bellevue Square", banner: "", address: "2 Main St", city: "Bellevue", state: "WA", zip: "98004" },
];

const exerciseSearch = (script, { fbq: fbqKind, ttq: ttqKind }) => {
  const calls = { gtag: [], fbq: [], tiktok: [] };
  const record = (bucket) => (...args) => calls[bucket].push(args);
  const throwAfterRecord = (bucket, label) => (...args) => { calls[bucket].push(args); throw new Error(`${label} SDK threw`); };

  const input = { value: "seattle" };
  const results = { innerHTML: "", addEventListener() {} };
  let submitHandler = null;

  const sandbox = {
    document: {
      querySelector(selector) {
        if (selector === "#product-world") return { offsetHeight: 60, offsetTop: 0 };
        if (selector === "#store-search") return { addEventListener(type, handler) { if (type === "submit") submitHandler = handler; } };
        if (selector === "#store-query") return input;
        if (selector === "#store-results") return results;
        return null;
      },
      querySelectorAll() { return []; },
    },
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener() {},
      scrollY: 0,
      innerHeight: 800,
      ICE_NOVA_STORES: STORE_FIXTURES,
      gtag: record("gtag"),
    },
  };

  if (fbqKind === "healthy") sandbox.window.fbq = record("fbq");
  else if (fbqKind === "throwing") sandbox.window.fbq = throwAfterRecord("fbq", "Meta");
  if (ttqKind === "healthy") sandbox.window.ttq = { track: record("tiktok") };
  else if (ttqKind === "throwing") sandbox.window.ttq = { track: throwAfterRecord("tiktok", "TikTok") };
  else if (ttqKind === "null") sandbox.window.ttq = null;
  else if (ttqKind === "missing-track") sandbox.window.ttq = {};

  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  assert.ok(submitHandler, "store-search submit handler must be registered");
  let threw = false;
  try {
    submitHandler({ preventDefault() {} });
  } catch {
    threw = true;
  }
  return { calls, html: results.innerHTML, threw };
};

test("isolates Meta and TikTok SDK failures from each other, GA4, and page behavior", async () => {
  const script = await readFile(new URL("docs/site.js", root), "utf8");
  const scenarios = [
    { name: "Meta absent, TikTok healthy", fbq: "absent", ttq: "healthy", fbqAttempts: 0, ttqAttempts: 1 },
    { name: "TikTok absent, Meta healthy", fbq: "healthy", ttq: "absent", fbqAttempts: 1, ttqAttempts: 0 },
    { name: "window.ttq is null", fbq: "healthy", ttq: "null", fbqAttempts: 1, ttqAttempts: 0 },
    { name: "ttq.track is missing", fbq: "healthy", ttq: "missing-track", fbqAttempts: 1, ttqAttempts: 0 },
    { name: "Meta dispatch throws", fbq: "throwing", ttq: "healthy", fbqAttempts: 1, ttqAttempts: 1 },
    { name: "TikTok dispatch throws", fbq: "healthy", ttq: "throwing", fbqAttempts: 1, ttqAttempts: 1 },
    { name: "both vendors absent", fbq: "absent", ttq: "absent", fbqAttempts: 0, ttqAttempts: 0 },
  ];

  for (const { name, fbq, ttq, fbqAttempts, ttqAttempts } of scenarios) {
    const { calls, html, threw } = exerciseSearch(script, { fbq, ttq });
    assert.equal(threw, false, `${name}: no exception may propagate from the submit handler`);
    assert.equal(calls.gtag.length, 1, `${name}: GA4 dispatch must still run`);
    assert.equal(calls.gtag[0][0], "event");
    assert.equal(calls.gtag[0][1], "store_search");
    assert.equal(calls.gtag[0][2].searched_area, "Seattle, WA");
    assert.equal(calls.gtag[0][2].search_status, "results");
    assert.equal(calls.gtag[0][2].result_count, 1);
    assert.equal(calls.fbq.length, fbqAttempts, `${name}: Meta dispatch attempted ${fbqAttempts} time(s)`);
    if (fbqAttempts) {
      assert.equal(calls.fbq[0][0], "trackCustom");
      assert.equal(calls.fbq[0][1], "store_search");
      assert.deepEqual(calls.fbq[0][2], calls.gtag[0][2]);
    }
    assert.equal(calls.tiktok.length, ttqAttempts, `${name}: TikTok dispatch attempted ${ttqAttempts} time(s)`);
    if (ttqAttempts) {
      assert.equal(calls.tiktok[0][0], "store_search");
      assert.deepEqual(calls.tiktok[0][1], calls.gtag[0][2]);
    }
    assert.match(html, /<article class="result">/, `${name}: search results must still render`);
    assert.match(html, /Seattle Flagship/, `${name}: store name must still render`);
  }
});

