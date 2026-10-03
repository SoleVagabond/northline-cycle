import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  readdir,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server.js";
import { calculateEstimate } from "../lib/services.js";
import http from "node:http";
import { createWorkspace } from "../lib/repairs.js";

async function fixture(t, failStorage = false) {
  const directory = await mkdtemp(join(tmpdir(), "northline-test-"));
  if (failStorage) await writeFile(join(directory, "blocked"), "fixture");
  const dataFile = join(
    directory,
    failStorage ? "blocked/enquiries.ndjson" : "enquiries.ndjson",
  );
  const server = createApp({ dataFile });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (
      !resolve(directory).startsWith(resolve(join(tmpdir(), "northline-test-")))
    )
      throw new Error("Refusing cleanup outside the test directory prefix.");
    await rm(directory, { recursive: true, force: true });
  });
  return { url: `http://127.0.0.1:${server.address().port}`, dataFile };
}
const sample = {
  requestId: "11111111-1111-4111-8111-111111111111",
  bikeId: "city",
  issueId: "brakes",
  serviceId: "tune",
  collection: true,
  slot: "flexible",
};
const storedWorkspace = (dataFile, result) =>
  readFile(
    join(dataFile, "..", "tracker", result.workspace.id + ".json"),
    "utf8",
  ).then(JSON.parse);
const post = (url, body, headers = { "Content-Type": "application/json" }) =>
  fetch(url + "/api/enquiries", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("catalogue exposes six services and the expected starting estimate", async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(url + "/api/services");
  assert.equal(response.status, 200);
  const { services } = await response.json();
  assert.equal(services.length, 6);
  assert.equal(services[0].price, 25);
});
test("valid request is stored; server computes price instead of trusting the client", async (t) => {
  const { url, dataFile } = await fixture(t);
  const response = await post(url, { ...sample, estimate: 1 });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.estimate, 80);
  assert.match(result.id, /^[a-f0-9-]{36}$/);
  const saved = await storedWorkspace(dataFile, result);
  const job = saved.jobs.find((item) => item.id === result.repairId);
  assert.equal(job.rider, "Jamie R.");
  assert.equal(job.estimate, 80);
  assert.equal(job.enquiryId, result.id);
  assert.equal(job.status, "received");
  assert.equal(job.email, undefined);
  assert.equal(job.notes, undefined);
});
test("missing or invalid fields are rejected without creating a record", async (t) => {
  const { url, dataFile } = await fixture(t);
  for (const body of [
    { ...sample, bikeId: "unknown" },
    { ...sample, issueId: "unknown" },
    { ...sample, serviceId: "made-up" },
    { ...sample, collection: "true" },
    { ...sample, slot: "midnight" },
    { ...sample, email: "private@example.com" },
    { ...sample, name: "A real person" },
    { ...sample, notes: "private note" },
    { ...sample, requestId: "invalid" },
    null,
    [],
  ])
    assert.equal((await post(url, body)).status, 422);
  await assert.rejects(readdir(join(dataFile, "..", "tracker")), {
    code: "ENOENT",
  });
});
test("malformed JSON and wrong content type receive clear errors", async (t) => {
  const { url } = await fixture(t);
  assert.equal((await post(url, "{")).status, 400);
  assert.equal(
    (await post(url, "hello", { "Content-Type": "text/plain" })).status,
    415,
  );
});
test("oversized request is rejected", async (t) => {
  const { url } = await fixture(t);
  assert.equal(
    (await post(url, { ...sample, notes: "x".repeat(9000) })).status,
    413,
  );
});
test("simultaneous requests keep separate records and unique references", async (t) => {
  const { url, dataFile } = await fixture(t);
  const responses = await Promise.all(
    Array.from({ length: 6 }, (_, i) => post(url, sample)),
  );
  const records = [];
  for (const response of responses) {
    assert.equal(response.status, 201);
    const result = await response.json();
    records.push(await storedWorkspace(dataFile, result));
  }
  assert.equal(records.length, 6);
  assert.equal(new Set(records.map((record) => record.id)).size, 6);
});
test("storage failure returns an error instead of a false success", async (t) => {
  const { url } = await fixture(t, true);
  const response = await post(url, sample);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /could not save/);
});
test("internal files and enquiry records cannot be downloaded over HTTP", async (t) => {
  const { url } = await fixture(t);
  for (const path of [
    "/server.js",
    "/data/enquiries.ndjson",
    "/package.json",
    "/api/enquiries",
    "/../server.js",
    "/%2e%2e%2fserver.js",
  ])
    assert.equal((await fetch(url + path)).status, 404);
  assert.equal(
    (await fetch(url + "/api/enquiries", { method: "DELETE" })).status,
    405,
  );
});
test("HTML is served with a same-origin content policy and proper content type", async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.match(await response.text(), /Northline Cycle Co/);
});
test("estimate handles collection and rejects unknown services", () => {
  assert.equal(calculateEstimate("tune", false), 65);
  assert.equal(calculateEstimate("tune", true), 80);
  assert.throws(() => calculateEstimate("unknown"), RangeError);
});
test("a Unicode sample choice survives a split UTF-8 network packet", async (t) => {
  const { url, dataFile } = await fixture(t);
  const payload = Buffer.from(JSON.stringify({ ...sample, bikeId: "café" }));
  const split = payload.indexOf(Buffer.from("é")) + 1;
  let responseBody;
  const status = await new Promise((resolve, reject) => {
    const request = http.request(
      url + "/api/enquiries",
      { method: "POST", headers: { "Content-Type": "application/json" } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          responseBody = JSON.parse(Buffer.concat(chunks));
          resolve(response.statusCode);
        });
      },
    );
    request.on("error", reject);
    request.write(payload.subarray(0, split));
    setTimeout(() => request.end(payload.subarray(split)), 50);
  });
  assert.equal(status, 201);
  const saved = await storedWorkspace(dataFile, responseBody);
  assert.equal(saved.jobs[0].bike, "Café cruiser");
});
test("local cleanup physically removes an expired workspace before serving its session", async (t) => {
  const { url, dataFile } = await fixture(t);
  const id = "22222222-2222-4222-8222-222222222222";
  const directory = join(dataFile, "..", "tracker");
  await mkdir(directory, { recursive: true });
  const file = join(directory, id + ".json");
  await writeFile(
    file,
    JSON.stringify(createWorkspace(id, new Date("2020-01-01T00:00:00Z"))),
  );
  const response = await fetch(url + "/api/tracker", {
    headers: { cookie: "northline_demo=" + id },
  });
  assert.equal(response.status, 404);
  await assert.rejects(readFile(file), { code: "ENOENT" });
});
