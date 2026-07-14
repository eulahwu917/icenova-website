import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSRpT5Iulo2bhKAeMmGupCYOMpNpn-jqhVkI5d5c9EMhAfum896XiXxI1jDkj6ktIp4L56P9d4CEbao/pub?gid=1042853975&single=true&output=csv";
const EXPECTED_HEADERS = ["store_id", "name", "banner", "address", "city", "state", "zip", "active", "notes", "last_updated"];
const REQUIRED_FIELDS = ["store_id", "name", "address", "city", "state", "zip", "active"];
const OUTPUT_PATH = resolve("docs/store-data.js");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((values) => values.some((value) => value.trim()));
}

function normalize(value) {
  return String(value ?? "").trim();
}

function exactHeaders(actual) {
  return actual.length === EXPECTED_HEADERS.length && actual.every((header, index) => header.trim() === EXPECTED_HEADERS[index]);
}

async function loadCsv() {
  const localFile = process.argv[2];
  if (localFile) return readFile(resolve(localFile), "utf8");

  const response = await fetch(process.env.STORE_CSV_URL || DEFAULT_CSV_URL, { headers: { "user-agent": "icenova-store-sync/1.0" } });
  if (!response.ok) throw new Error(`Google Sheet download failed with HTTP ${response.status}.`);
  return response.text();
}

async function existingStoreCount() {
  try {
    const source = await readFile(OUTPUT_PATH, "utf8");
    const json = source.replace(/^\s*window\.ICE_NOVA_STORES\s*=\s*/, "").replace(/;\s*$/, "");
    const stores = JSON.parse(json);
    return Array.isArray(stores) ? stores.length : 0;
  } catch {
    return 0;
  }
}

const csv = (await loadCsv()).replace(/^\uFEFF/, "");
const rows = parseCsv(csv);
if (!rows.length || !exactHeaders(rows[0])) {
  throw new Error(`CSV headers must be exactly: ${EXPECTED_HEADERS.join(",")}`);
}

const records = rows.slice(1).map((values, rowIndex) => {
  if (values.length !== EXPECTED_HEADERS.length) throw new Error(`Row ${rowIndex + 2} has ${values.length} columns; expected ${EXPECTED_HEADERS.length}.`);
  return Object.fromEntries(EXPECTED_HEADERS.map((header, index) => [header, normalize(values[index])]));
});

const ids = new Set();
const locations = new Set();
for (const [index, record] of records.entries()) {
  const rowNumber = index + 2;
  const missing = REQUIRED_FIELDS.filter((field) => !record[field]);
  if (missing.length) throw new Error(`Row ${rowNumber} is missing: ${missing.join(", ")}.`);
  if (!/^[A-Z]{2}$/.test(record.state)) throw new Error(`Row ${rowNumber} has invalid state: ${record.state}.`);
  if (!/^\d{5}(?:-\d{4})?$/.test(record.zip)) throw new Error(`Row ${rowNumber} has invalid ZIP code: ${record.zip}.`);
  if (!/^(TRUE|FALSE)$/i.test(record.active)) throw new Error(`Row ${rowNumber} active must be TRUE or FALSE.`);
  if (ids.has(record.store_id)) throw new Error(`Duplicate store_id: ${record.store_id}.`);
  ids.add(record.store_id);

  const locationKey = [record.name, record.address, record.zip].map((value) => value.toLowerCase().replace(/[^a-z0-9]/g, "")).join("|");
  if (locations.has(locationKey)) throw new Error(`Duplicate store location at row ${rowNumber}: ${record.name}, ${record.address}.`);
  locations.add(locationKey);
}

const stores = records
  .filter((record) => record.active.toUpperCase() === "TRUE")
  .map(({ store_id, name, banner, address, city, state, zip }) => ({ id: store_id, name, banner, address, city, state, zip }))
  .sort((a, b) => [a.state, a.city, a.banner, a.name, a.id].join("|").localeCompare([b.state, b.city, b.banner, b.name, b.id].join("|"), "en"));

if (stores.length < 100) throw new Error(`Safety check failed: only ${stores.length} active stores were found.`);
const previousCount = await existingStoreCount();
if (previousCount && stores.length < previousCount * 0.7 && process.env.ALLOW_LARGE_STORE_DROP !== "true") {
  throw new Error(`Safety check failed: active stores fell from ${previousCount} to ${stores.length}. Review the Sheet or explicitly allow the large drop.`);
}

await writeFile(OUTPUT_PATH, `window.ICE_NOVA_STORES=${JSON.stringify(stores)};\n`, "utf8");
console.log(`Validated ${records.length} rows and published ${stores.length} active stores.`);

