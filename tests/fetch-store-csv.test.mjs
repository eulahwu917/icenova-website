import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { fetchStoreCsv } from "../scripts/fetch-store-csv.mjs";

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function stopServer(server) {
  server.closeAllConnections();
  await new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

function serverUrl(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}/stores.csv`;
}

test("retries transient HTTP 400 responses before succeeding", async () => {
  const responses = [
    new Response("temporary export error", { status: 400, headers: { "content-type": "text/plain" } }),
    new Response("temporary export error", { status: 400, headers: { "content-type": "text/plain" } }),
    new Response("temporary export error", { status: 400, headers: { "content-type": "text/plain" } }),
    new Response("store_id,name", { status: 200, headers: { "content-type": "text/csv" } }),
  ];
  const requests = [];
  const delays = [];
  const warnings = [];

  const csv = await fetchStoreCsv("https://example.com/stores.csv", {
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return responses.shift();
    },
    sleep: async (delayMs) => delays.push(delayMs),
    warn: (message) => warnings.push(message),
  });

  assert.equal(csv, "store_id,name");
  assert.equal(requests.length, 4);
  assert.deepEqual(delays, [2_000, 8_000, 30_000]);
  assert.equal(warnings.length, 3);
  assert.equal(requests[0].init.headers["user-agent"], "icenova-store-sync/1.0");
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});

test("retries network errors", async () => {
  let requests = 0;

  const csv = await fetchStoreCsv("https://example.com/stores.csv", {
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) throw new TypeError("fetch failed");
      return new Response("store_id,name", { status: 200 });
    },
    retryDelaysMs: [0],
    sleep: async () => {},
    warn: () => {},
  });

  assert.equal(csv, "store_id,name");
  assert.equal(requests, 2);
});

test("times out a stalled request before retrying", async (context) => {
  let requests = 0;
  const server = await startServer((request, response) => {
    requests += 1;
    if (requests === 1) return;

    response.writeHead(200, { "content-type": "text/csv" });
    response.end("store_id,name");
  });
  context.after(() => stopServer(server));

  const csv = await fetchStoreCsv(serverUrl(server), {
    timeoutMs: 50,
    retryDelaysMs: [0],
    sleep: async () => {},
    warn: () => {},
  });

  assert.equal(csv, "store_id,name");
  assert.equal(requests, 2);
});

test("times out a stalled response body before retrying", async (context) => {
  let requests = 0;
  const server = await startServer((request, response) => {
    requests += 1;
    response.writeHead(200, { "content-type": "text/csv" });
    if (requests === 1) {
      response.write("store_id,");
      return;
    }

    response.end("store_id,name");
  });
  context.after(() => stopServer(server));

  const csv = await fetchStoreCsv(serverUrl(server), {
    timeoutMs: 50,
    retryDelaysMs: [0],
    sleep: async () => {},
    warn: () => {},
  });

  assert.equal(csv, "store_id,name");
  assert.equal(requests, 2);
});

test("fails immediately for permanent HTTP errors", async () => {
  let requests = 0;

  await assert.rejects(
    fetchStoreCsv("https://example.com/stores.csv", {
      fetchImpl: async () => {
        requests += 1;
        return new Response("sheet is not published", { status: 401, headers: { "content-type": "text/plain" } });
      },
      sleep: async () => assert.fail("a permanent failure must not sleep before retrying"),
      warn: () => assert.fail("a permanent failure must not announce a retry"),
    }),
    (error) => {
      assert.match(error.message, /failed after 1 attempt/);
      assert.match(error.message, /HTTP 401/);
      assert.match(error.message, /sheet is not published/);
      return true;
    },
  );

  assert.equal(requests, 1);
});

test("reports every transient failure after exhausting retries", async () => {
  let requests = 0;

  await assert.rejects(
    fetchStoreCsv("https://example.com/stores.csv", {
      fetchImpl: async () => {
        requests += 1;
        return new Response(`temporary failure ${requests}`, { status: 503 });
      },
      retryDelaysMs: [0],
      sleep: async () => {},
      warn: () => {},
    }),
    (error) => {
      assert.match(error.message, /failed after 4 attempts/);
      assert.match(error.message, /temporary failure 1/);
      assert.match(error.message, /temporary failure 4/);
      return true;
    },
  );

  assert.equal(requests, 4);
});
