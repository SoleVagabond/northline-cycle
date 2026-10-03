import test from "node:test";
import assert from "node:assert/strict";
import { createBlobStore } from "../lib/blob-store.js";
import { createApi } from "../lib/api.js";

function fakeStore() {
  const records = new Map();
  let version = 0;
  let reads = 0;
  let release;
  const simultaneous = new Promise((resolve) => {
    release = resolve;
  });
  let holdReads = false;
  return {
    hold() {
      holdReads = true;
    },
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, "strong");
      const record = records.get(key);
      const result = record ? structuredClone(record) : null;
      if (holdReads) {
        if (++reads === 2) release();
        await simultaneous;
      }
      return result;
    },
    async setJSON(key, data, options) {
      const prior = records.get(key);
      if (
        (options.onlyIfNew && prior) ||
        (options.onlyIfMatch && prior?.etag !== options.onlyIfMatch)
      )
        return { modified: false };
      const etag = String(++version);
      records.set(key, { data: structuredClone(data), etag });
      return { modified: true, etag };
    },
  };
}
test("separate cloud adapters use conditional writes to prevent lost concurrent updates", async () => {
  const store = fakeStore();
  const initial = await createApi(createBlobStore(store))(
    new Request("https://demo.test/api/tracker", { method: "POST" }),
  );
  const cookie = initial.headers.get("set-cookie").split(";")[0];
  const seed = (await initial.json()).workspace;
  store.hold();
  const update = () =>
    createApi(createBlobStore(store))(
      new Request("https://demo.test/api/tracker/actions", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          revision: seed.revision,
          jobId: "NL-2401",
          role: "customer",
          action: "approve",
        }),
      }),
    );
  const responses = await Promise.all([update(), update()]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  const saved = await createBlobStore(store).getWorkspace(seed.id);
  assert.equal(saved.revision, seed.revision + 1);
  assert.equal(saved.jobs[0].history.length, seed.jobs[0].history.length + 1);
});
test("cloud adapter rejects an unsuccessful workspace write", async () => {
  const storage = createBlobStore({
    setJSON: async () => ({ modified: false }),
  });
  await assert.rejects(
    storage.setWorkspace("sample", { expiresAt: "2026-01-01T00:00:00Z" }),
    (error) => error.status === 409,
  );
});
test("cloud adapter never updates a record without a storage version", async () => {
  const storage = createBlobStore({
    getWithMetadata: async () => ({ data: {} }),
  });
  await assert.rejects(storage.getWorkspace("sample"), /version/);
});
test("local emulator reads use matching before and after list versions", async () => {
  let reads = 0;
  let savedOptions;
  const store = {
    async getWithMetadata() {
      return { data: { revision: ++reads } };
    },
    async list() {
      return { blobs: [{ key: "tracker/sample", etag: "stable-version" }] };
    },
    async setJSON(key, value, options) {
      savedOptions = options;
      return { modified: true };
    },
  };
  const adapter = createBlobStore(store, { localEmulator: true });
  const data = await adapter.getWorkspace("sample");
  assert.equal(data.revision, 2);
  await adapter.setWorkspace("sample", data);
  assert.deepEqual(savedOptions, {
    onlyIfMatch: "stable-version",
    metadata: { expiresAt: undefined },
  });
});
test("local emulator rejects a read if its surrounding versions change", async () => {
  let version = 0;
  const store = {
    async getWithMetadata() {
      return { data: {} };
    },
    async list() {
      return { blobs: [{ key: "tracker/sample", etag: String(++version) }] };
    },
  };
  await assert.rejects(
    createBlobStore(store, { localEmulator: true }).getWorkspace("sample"),
    (error) => error.status === 409,
  );
});
