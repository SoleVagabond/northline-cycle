import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApi } from "../lib/api.js";
import { cleanupExpired } from "../lib/cleanup.js";

function fixture() {
  const records = new Map();
  let time = new Date("2026-10-03T12:00:00Z");
  const store = {
    async getWorkspace(id) {
      return structuredClone(records.get(id) || null);
    },
    async setWorkspace(id, data) {
      records.set(id, structuredClone(data));
    },
    async transaction(run) {
      return run();
    },
  };
  const api = createApi(store, { now: () => time });
  const call = (path, body, cookie = "") =>
    api(
      new Request("https://demo.test" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { cookie, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return {
    call,
    records,
    later: () => {
      time = new Date(time.getTime() + 8 * 86400000);
    },
  };
}
const choices = () => ({
  requestId: randomUUID(),
  bikeId: "city",
  issueId: "gears",
  serviceId: "tune",
  collection: true,
  slot: "morning",
});
test("a submitted request completes the full repair journey in the same workspace", async () => {
  const { call } = fixture();
  const created = await call("/api/enquiries", choices());
  assert.equal(created.status, 201);
  const cookie = created.headers.get("set-cookie").split(";")[0];
  const data = await created.json();
  assert.equal(data.estimate, 80);
  assert.equal(data.workspace.jobs.length, 4);
  let workspace = data.workspace;
  for (const [action, role, expected] of [
    ["advance", "workshop", "inspection"],
    ["advance", "workshop", "approval"],
    ["approve", "customer", "repairing"],
    ["advance", "workshop", "quality"],
    ["advance", "workshop", "ready"],
    ["advance", "workshop", "collected"],
  ]) {
    const response = await call(
      "/api/tracker/actions",
      { jobId: data.repairId, revision: workspace.revision, action, role },
      cookie,
    );
    assert.equal(response.status, 200);
    workspace = (await response.json()).workspace;
    assert.equal(
      workspace.jobs.find((job) => job.id === data.repairId).status,
      expected,
    );
  }
  const reloaded = (
    await (await call("/api/tracker", undefined, cookie)).json()
  ).workspace;
  assert.equal(reloaded.jobs[0].history.length, 7);
  assert.equal(reloaded.jobs[0].status, "collected");
});
test("retrying the same request returns its saved repair without creating a duplicate", async () => {
  const { call } = fixture();
  const input = choices();
  const response = await call("/api/enquiries", input);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  const first = await response.json();
  const retry = await call("/api/enquiries", input, cookie);
  assert.equal(retry.status, 200);
  const second = await retry.json();
  assert.equal(second.repairId, first.repairId);
  assert.equal(second.workspace.jobs.length, 4);
  assert.equal(second.workspace.revision, first.workspace.revision);
  assert.equal(
    (await call("/api/enquiries", { ...input, serviceId: "wheel" }, cookie))
      .status,
    409,
  );
});
test("workspaces expire after seven days; a return starts a fresh demo", async () => {
  const { call, later } = fixture();
  const started = await call("/api/tracker", {});
  const cookie = started.headers.get("set-cookie").split(";")[0];
  const before = (await started.json()).workspace;
  later();
  assert.equal((await call("/api/tracker", undefined, cookie)).status, 404);
  const renewed = await call("/api/tracker", {}, cookie);
  assert.equal(renewed.status, 201);
  assert.notEqual((await renewed.json()).workspace.id, before.id);
});
test("workspace capacity limits repeated creations while leaving prior repairs intact", async () => {
  const { call } = fixture();
  const started = await call("/api/tracker", {});
  const cookie = started.headers.get("set-cookie").split(";")[0];
  for (let i = 0; i < 7; i++)
    assert.equal((await call("/api/enquiries", choices(), cookie)).status, 201);
  assert.equal((await call("/api/enquiries", choices(), cookie)).status, 422);
  assert.equal(
    (await (await call("/api/tracker", undefined, cookie)).json()).workspace
      .jobs.length,
    10,
  );
});
test("personal fields are rejected and are never stored", async () => {
  const { call, records } = fixture();
  for (const data of [
    { email: "person@example.com" },
    { name: "Personal Name" },
    { notes: "Private details" },
  ])
    assert.equal(
      (await call("/api/enquiries", { ...choices(), ...data })).status,
      422,
    );
  assert.equal(records.size, 0);
});
test("cleanup removes expired samples and keeps current samples", async () => {
  const deleted = [];
  const store = {
    async *list() {
      yield { blobs: [{ key: "tracker/old" }, { key: "tracker/current" }] };
    },
    async getMetadata(key) {
      return {
        metadata: {
          expiresAt: key.endsWith("old")
            ? "2020-01-01T00:00:00Z"
            : "2099-01-01T00:00:00Z",
        },
      };
    },
    async delete(key) {
      deleted.push(key);
    },
  };
  const result = await cleanupExpired(store);
  assert.deepEqual(deleted, ["tracker/old"]);
  assert.equal(result.deleted, 1);
});
test("bounded cleanup resumes beyond current records instead of starving older samples", async () => {
  let cursor = null;
  const deleted = [];
  const store = {
    async get() {
      return cursor;
    },
    async setJSON(key, value) {
      cursor = value;
    },
    async *list() {
      yield { blobs: [{ key: "tracker/a" }, { key: "tracker/b" }] };
    },
    async getMetadata(key) {
      return {
        metadata: {
          expiresAt: key.endsWith("b")
            ? "2020-01-01T00:00:00Z"
            : "2099-01-01T00:00:00Z",
        },
      };
    },
    async delete(key) {
      deleted.push(key);
    },
  };
  assert.equal((await cleanupExpired(store, { batchLimit: 1 })).more, true);
  assert.equal(cursor.lastKey, "tracker/a");
  assert.equal((await cleanupExpired(store, { batchLimit: 1 })).deleted, 1);
  assert.deepEqual(deleted, ["tracker/b"]);
  assert.equal(cursor.lastKey, "");
});
