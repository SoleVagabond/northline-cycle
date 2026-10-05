import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorkspace } from "../lib/repairs.js";
import {
  operationsWorkspace,
  workshopAction,
  repairAction,
  stockSummary,
} from "../lib/workshop-domain.js";
import { partsCatalogue, staffCatalogue } from "../lib/shop-data.js";
import { quoteFor } from "../lib/quotes.js";
import { cents, sumMoney } from "../lib/money.js";
import { createApi } from "../lib/api.js";
import { validateImage } from "../lib/photos.js";
import { createApp } from "../server.js";
import { scheduleConflicts } from "../lib/workshop-query.js";
import { createBlobStore } from "../lib/blob-store.js";
import { cleanupExpired } from "../lib/cleanup.js";
const now = new Date("2026-10-05T12:00:00Z");
const seed = () => operationsWorkspace(createWorkspace(randomUUID(), now));
const act = (workspace, input, options) =>
  workshopAction(workspace, input, now, options);
const work = (workspace, extras = {}) =>
  repairAction(
    workspace,
    {
      jobId: "NL-2401",
      role: "workshop",
      action: "revise",
      reasonId: "inspection",
      serviceLines: [
        {
          id: "brake",
          quantity: 2,
          unitPrice: 40.25,
          description: "Adjust front and rear mechanical brakes",
        },
        {
          id: "wheel",
          quantity: 1,
          unitPrice: 35.1,
          description: "True rear wheel after spoke inspection",
        },
      ],
      partLines: [
        {
          id: "pads",
          quantity: 2,
          specification: "Shimano B05S-RX, inspected calipers",
        },
      ],
      ...extras,
    },
    now,
  );
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4/x8AAwAB//wl3FEAAAAASUVORK5CYII=";
test("migration preserves decisions, creates stable separate people and bike IDs, and is idempotent", () => {
  const old = createWorkspace(randomUUID(), now);
  old.jobs.forEach((job) => delete job.mechanicId);
  old.jobs[1].rider = old.jobs[0].rider;
  const original = structuredClone(old);
  const workspace = operationsWorkspace(old);
  assert.deepEqual(old, original);
  assert.equal(workspace.customers.length, 3);
  assert.equal(workspace.jobs[0].mechanicId, "alex");
  assert.equal(workspace.jobs[1].mechanicId, "sam");
  assert.notEqual(workspace.jobs[0].customerId, workspace.jobs[1].customerId);
  assert.deepEqual(workspace.jobs[0].history, old.jobs[0].history);
  assert.deepEqual(operationsWorkspace(workspace), workspace);
});
test("returning bikes share history while customer edits preserve earlier repair snapshots", () => {
  let workspace = seed();
  const first = workspace.jobs[0];
  const bike = workspace.bikes[0];
  const created = act(workspace, {
    action: "create",
    requestId: randomUUID(),
    bikeId: "city",
    issueId: "brakes",
    serviceId: "brake",
    collection: false,
    recordBikeId: bike.id,
    condition: "Scratched left grip; lock left at home",
  });
  workspace = created.workspace;
  assert.equal(
    workspace.jobs.filter((job) => job.recordBikeId === bike.id).length,
    2,
  );
  workspace = act(workspace, {
    action: "save-customer",
    customerId: bike.customerId,
    name: "Jamie Newname",
    email: "jamie@example.test",
    phone: "",
  }).workspace;
  assert.equal(
    workspace.jobs.find((job) => job.id === first.id).rider,
    first.rider,
  );
  assert.equal(
    workspace.jobs[0].condition,
    "Scratched left grip; lock left at home",
  );
});
test("configurable services and SKUs support cents and new intake without rewriting past quotes", () => {
  let workspace = seed();
  const previous = quoteFor(workspace.jobs[0]);
  workspace = act(workspace, {
    action: "save-service",
    name: "Tubeless refresh",
    unit: "Per wheel",
    description: "Inspect sealant and valve; tyre replacement excluded",
    includes: ["Sealant check", "Valve inspection"],
    price: 29.95,
    enabled: true,
  }).workspace;
  const service = workspace.customServices[0];
  const result = act(workspace, {
    action: "create",
    requestId: randomUUID(),
    bikeId: "city",
    issueId: "routine",
    serviceId: service.id,
    collection: false,
  });
  workspace = result.workspace;
  assert.equal(workspace.jobs[0].estimate, 29.95);
  assert.equal(workspace.jobs[0].serviceSnapshot.name, "Tubeless refresh");
  workspace = act(workspace, {
    action: "save-part",
    name: "Continental tube",
    sku: "CON-700-28",
    specification: "700C 28–32mm, 42mm Presta",
    price: 8.95,
    reorderAt: 3,
    enabled: true,
  }).workspace;
  assert.equal(stockSummary(workspace).at(-1).onHand, 0);
  assert.equal(partsCatalogue(workspace).at(-1).price, 8.95);
  assert.deepEqual(
    quoteFor(workspace.jobs.find((job) => job.id === "NL-2401")),
    previous,
  );
  assert.throws(
    () =>
      act(workspace, {
        action: "save-part",
        name: "Duplicate",
        sku: "con-700-28",
        specification: "700C",
        price: 5,
        reorderAt: 2,
        enabled: true,
      }),
    /SKU already/,
  );
});
test("multi-service and part totals use exact cents and snapshots survive config edits", () => {
  let workspace = work(seed());
  const snapshot = structuredClone(quoteFor(workspace.jobs[0]));
  assert.equal(snapshot.labour, 115.6);
  assert.equal(snapshot.total, 180.6);
  assert.equal(snapshot.serviceLines[0].price, 80.5);
  workspace = act(workspace, {
    action: "catalog",
    serviceId: "brake",
    price: 99.95,
    enabled: true,
  }).workspace;
  assert.deepEqual(quoteFor(workspace.jobs[0]), snapshot);
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  assert.equal(cents(80.5), 8050);
  for (const price of [NaN, Infinity, -1, 1.001, "8"])
    assert.throws(() => cents(price));
});
test("scope changes at the same itemized price invalidate approval and retain the older decision", () => {
  let workspace = work(seed());
  workspace = repairAction(
    workspace,
    { jobId: "NL-2401", role: "customer", action: "approve", quoteVersion: 2 },
    now,
  );
  const old = structuredClone(quoteFor(workspace.jobs[0]));
  const changed = old.serviceLines.map(
    ({ id, quantity, unitPrice, description }) => ({
      id,
      quantity,
      unitPrice,
      description: description + "; verify cable routing",
    }),
  );
  workspace = work(workspace, { serviceLines: changed });
  assert.equal(workspace.jobs[0].approved, false);
  assert.equal(workspace.jobs[0].status, "approval");
  assert.deepEqual(workspace.jobs[0].quotes[1], old);
  assert.throws(
    () =>
      repairAction(
        workspace,
        {
          jobId: "NL-2401",
          role: "customer",
          action: "approve",
          quoteVersion: 2,
        },
        now,
      ),
    /changed/,
  );
});
test("malformed service lines, forged part prices and excessive precision cannot change records", () => {
  const original = seed();
  const saved = structuredClone(original);
  for (const serviceLines of [
    [],
    [{ id: "brake", quantity: 1, unitPrice: 1.005, description: "Work" }],
    [{ id: "missing", quantity: 1, unitPrice: 25, description: "Work" }],
    [{ id: "brake", quantity: 0, unitPrice: 25, description: "Work" }],
    [
      {
        id: "brake",
        quantity: 1,
        unitPrice: 25,
        description: "Work",
        total: 1,
      },
    ],
  ])
    assert.throws(() => work(original, { serviceLines }));
  assert.throws(() =>
    work(original, {
      partLines: [
        { id: "pads", quantity: 1, specification: "Compatible", price: 0 },
      ],
    }),
  );
  assert.deepEqual(original, saved);
});
test("shop closure, time off and staff working days gate scheduling without changing existing records", () => {
  let workspace = seed();
  workspace = act(workspace, {
    action: "save-shop",
    name: "Northline",
    openingDays: [2, 3, 4, 5, 6],
    opens: "10:00",
    closes: "18:00",
  }).workspace;
  const schedule = {
    action: "schedule",
    jobId: "NL-2401",
    dueDate: "2026-10-05",
    mechanicId: "alex",
    priority: "routine",
    benchMinutes: 100,
  };
  assert.throws(() => act(workspace, schedule), /shop is closed/);
  const alex = staffCatalogue(workspace)[0];
  workspace = act(workspace, {
    action: "save-staff",
    mechanicId: "alex",
    ...Object.fromEntries(
      ["name", "specialty", "capacity", "workDays", "enabled"].map((key) => [
        key,
        alex[key],
      ]),
    ),
    unavailableDates: ["2026-10-06"],
  }).workspace;
  assert.throws(
    () => act(workspace, { ...schedule, dueDate: "2026-10-06" }),
    /unavailable/,
  );
  assert.equal(
    act(workspace, { ...schedule, dueDate: "2026-10-07" }).workspace.jobs[0]
      .benchMinutes,
    100,
  );
});
test("public records reject real contacts while protected installations accept them", () => {
  const workspace = seed();
  const input = {
    action: "save-customer",
    name: "Test rider",
    email: "rider@example.com",
    phone: "555-0100",
  };
  assert.throws(() => act(workspace, input), /fictional/);
  assert.equal(
    act(workspace, input, { allowPersonalData: true }).workspace.customers.at(
      -1,
    ).phone,
    "555-0100",
  );
});
test("changing staff or shop availability flags existing plans without silently rescheduling", () => {
  let workspace = seed();
  const original = structuredClone(workspace.jobs);
  workspace = act(workspace, {
    action: "save-shop",
    name: "Northline",
    openingDays: [2, 3, 4, 5, 6],
    opens: "10:00",
    closes: "18:00",
  }).workspace;
  assert.ok(
    scheduleConflicts(workspace).some(
      (item) =>
        item.jobId === "NL-2401" && item.reasons.includes("Shop closed"),
    ),
  );
  assert.deepEqual(workspace.jobs, original);
});
test("cloud photo adapter stores unique media with expiry and cleanup deletes expired images while retaining current ones", async () => {
  const records = new Map();
  const deleted = [];
  const store = {
    get: async (key) => records.get(key)?.data || null,
    setJSON: async (key, data, options = {}) => {
      assert.equal(options.onlyIfNew, true);
      records.set(key, { data, metadata: options.metadata });
      return { modified: true };
    },
    delete: async (key) => {
      deleted.push(key);
      records.delete(key);
    },
    getMetadata: async (key) => ({ metadata: records.get(key)?.metadata }),
    list: ({ prefix }) =>
      (async function* () {
        yield {
          blobs: [...records.keys()]
            .filter((key) => key.startsWith(prefix))
            .map((key) => ({ key })),
        };
      })(),
  };
  const storage = createBlobStore(store);
  await storage.setPhoto(
    "workspace",
    "old",
    validateImage(image),
    "2026-10-01T00:00:00Z",
  );
  await storage.setPhoto(
    "workspace",
    "current",
    validateImage(image),
    "2026-10-10T00:00:00Z",
  );
  assert.equal(
    (await storage.getPhoto("workspace", "current")).type,
    "image/png",
  );
  assert.equal(
    (
      await cleanupExpired(
        { ...store, setJSON: undefined },
        { now: now.getTime() },
      )
    ).deleted,
    1,
  );
  assert.deepEqual(deleted, ["photos/workspace/old"]);
  assert.ok(await storage.getPhoto("workspace", "current"));
});
function memory() {
  const records = new Map(),
    photos = new Map();
  return {
    getWorkspace: async (id) => structuredClone(records.get(id) || null),
    setWorkspace: async (id, value) => records.set(id, structuredClone(value)),
    transaction: async (run) => run(),
    setPhoto: async (id, photo, value) => photos.set(id + photo, value),
    getPhoto: async (id, photo) => photos.get(id + photo),
    deletePhoto: async (id, photo) => photos.delete(id + photo),
  };
}
async function apiFixture() {
  const storage = memory();
  let time = now;
  const api = createApi(storage, { now: () => time });
  const start = await api(
    new Request("https://shop.test/api/tracker", { method: "POST" }),
  );
  let workspace = (await start.json()).workspace;
  const cookie = start.headers.get("set-cookie").split(";")[0];
  const request = async (path, input, token, origin = "https://shop.test") => {
    const response = await api(
      new Request("https://shop.test" + path, {
        method: input ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          cookie,
          origin,
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        body: input ? JSON.stringify(input) : undefined,
      }),
    );
    return {
      response,
      data: response.headers.get("Content-Type")?.startsWith("application/json")
        ? await response.json()
        : await response.arrayBuffer(),
    };
  };
  const operation = async (input) => {
    const result = await request("/api/workshop/actions", {
      ...input,
      revision: workspace.revision,
    });
    if (result.data.workspace) workspace = result.data.workspace;
    return result;
  };
  return {
    storage,
    request,
    operation,
    get workspace() {
      return workspace;
    },
    setTime: (value) => {
      time = value;
    },
  };
}
test("repair links reveal one repair only and exclude internal notes, diagnosis and credential hashes", async () => {
  const f = await apiFixture();
  await f.operation({
    action: "add-note",
    jobId: "NL-2401",
    note: "Internal buying negotiation",
  });
  await f.operation({
    action: "inspection-record",
    jobId: "NL-2401",
    condition: "Scratch",
    diagnosis: "Internal diagnosis",
  });
  await f.operation({
    action: "customer-update",
    jobId: "NL-2401",
    note: "Your inspected estimate is ready.",
  });
  const link = await f.operation({ action: "create-link", jobId: "NL-2401" });
  assert.equal(link.response.status, 200);
  assert.equal(link.data.workspace.jobs[0].customerAccess.hash, undefined);
  const portal = await f.request(
    "/api/customer/repair",
    undefined,
    link.data.portalFragment,
  );
  assert.equal(portal.response.status, 200);
  assert.equal(portal.data.job.id, "NL-2401");
  const text = JSON.stringify(portal.data);
  assert.doesNotMatch(
    text,
    /Internal buying|Internal diagnosis|NL-2402|hash|customerId|customers/,
  );
  assert.match(text, /Your inspected estimate/);
  assert.equal((await f.request("/api/customer/repair")).response.status, 401);
  assert.equal(
    (
      await f.request(
        "/api/customer/decision",
        {
          action: "approve",
          revision: f.workspace.revision,
          quoteVersion: 1,
          jobId: "NL-2402",
        },
        link.data.portalFragment,
      )
    ).response.status,
    422,
  );
});
test("portal approval checks revision and version and cannot authorize another repair or workshop action", async () => {
  const f = await apiFixture();
  const link = await f.operation({ action: "create-link", jobId: "NL-2401" });
  const token = link.data.portalFragment;
  const revision = f.workspace.revision;
  assert.equal(
    (
      await f.request(
        "/api/customer/decision",
        { action: "approve", revision, quoteVersion: 2 },
        token,
      )
    ).response.status,
    409,
  );
  const accepted = await f.request(
    "/api/customer/decision",
    { action: "approve", revision, quoteVersion: 1 },
    token,
  );
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.job.status, "repairing");
  assert.equal(
    (
      await f.request(
        "/api/customer/decision",
        { action: "approve", revision, quoteVersion: 1 },
        token,
      )
    ).response.status,
    409,
  );
  assert.equal(
    (
      await f.request(
        "/api/customer/decision",
        {
          action: "advance",
          revision: accepted.data.revision,
          quoteVersion: 1,
        },
        token,
      )
    ).response.status,
    422,
  );
  assert.equal(
    (
      await f.request(
        "/api/customer/decision",
        {
          action: "approve",
          revision: accepted.data.revision,
          quoteVersion: 1,
        },
        token,
        "https://evil.test",
      )
    ).response.status,
    403,
  );
});
test("regenerated, revoked and expired customer links cannot read or decide", async () => {
  const f = await apiFixture();
  const first = (await f.operation({ action: "create-link", jobId: "NL-2401" }))
    .data.portalFragment;
  const second = (
    await f.operation({ action: "create-link", jobId: "NL-2401" })
  ).data.portalFragment;
  assert.equal(
    (await f.request("/api/customer/repair", undefined, first)).response.status,
    401,
  );
  await f.operation({ action: "revoke-link", jobId: "NL-2401" });
  assert.equal(
    (await f.request("/api/customer/repair", undefined, second)).response
      .status,
    401,
  );
  const third = (await f.operation({ action: "create-link", jobId: "NL-2401" }))
    .data.portalFragment;
  f.setTime(new Date(now.getTime() + 8 * 86400000));
  assert.equal(
    (await f.request("/api/customer/repair", undefined, third)).response.status,
    401,
  );
});
test("private and shared photos persist separately and portal images cannot reveal private or unrelated files", async () => {
  const f = await apiFixture();
  for (const customerVisible of [false, true]) {
    const upload = await f.request("/api/photos", {
      revision: f.workspace.revision + (customerVisible ? 1 : 0),
      jobId: "NL-2401",
      data: image,
      caption: customerVisible ? "Visible wear" : "Private intake",
      customerVisible,
    });
    assert.equal(upload.response.status, 201);
  }
  const link = await f.operation({ action: "create-link", jobId: "NL-2401" });
  // The operator action is stale after upload; explicitly reload rather than disguising a conflict.
  assert.equal(link.response.status, 409);
  const loaded = await f.request("/api/workshop");
  const created = await f.request("/api/workshop/actions", {
    action: "create-link",
    jobId: "NL-2401",
    revision: loaded.data.workspace.revision,
  });
  const portal = await f.request(
    "/api/customer/repair",
    undefined,
    created.data.portalFragment,
  );
  assert.equal(portal.data.job.photos.length, 1);
  const saved = loaded.data.workspace.jobs[0].photos;
  assert.equal(
    (
      await f.request(
        "/api/customer/photos/" + saved[0].id,
        undefined,
        created.data.portalFragment,
      )
    ).response.status,
    404,
  );
  const shared = await f.request(
    "/api/customer/photos/" + saved[1].id,
    undefined,
    created.data.portalFragment,
  );
  assert.equal(shared.response.headers.get("Content-Type"), "image/png");
  assert.equal(Buffer.from(shared.data).toString("base64"), image);
});
test("image validation rejects SVG, excessive payloads and impossible dimensions", () => {
  assert.equal(validateImage(image).type, "image/png");
  for (const value of [
    Buffer.from('<svg onload="alert(1)"/>').toString("base64"),
    "A".repeat(1400004),
    "not-base64",
    "",
  ])
    assert.throws(() => validateImage(value));
  const bytes = Buffer.from(image, "base64");
  bytes.writeUInt32BE(999999, 16);
  assert.throws(
    () => validateImage(bytes.toString("base64")),
    /damaged|megapixels/,
  );
  assert.throws(
    () =>
      validateImage(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      ),
    /damaged/,
  );
});
test("a rejected photo workspace write removes its own new media and preserves the earlier repair", async () => {
  const storage = memory();
  const api = createApi(storage, { now: () => now });
  const initial = await api(
    new Request("https://shop.test/api/tracker", { method: "POST" }),
  );
  const cookie = initial.headers.get("set-cookie").split(";")[0];
  const original = (await initial.json()).workspace;
  const deleted = [];
  const set = storage.setWorkspace;
  storage.setWorkspace = async () => {
    throw Object.assign(new Error("Concurrent change"), { status: 409 });
  };
  storage.deletePhoto = async (id, photo) => deleted.push({ id, photo });
  const result = await api(
    new Request("https://shop.test/api/photos", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        revision: original.revision,
        jobId: "NL-2401",
        data: image,
        caption: "Rejected concurrent photo",
        customerVisible: false,
      }),
    }),
  );
  assert.equal(result.status, 409);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].id, original.id);
  assert.deepEqual(await storage.getWorkspace(original.id), original);
  storage.setWorkspace = set;
});
test("private installation serves scoped customer links without an operator session and keeps photos across restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "northline-orders-"));
  const dataFile = join(directory, "records.ndjson");
  const key = "test-only-workshop-secret";
  let server = createApp({ dataFile, operatorKey: key });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const stop = () => new Promise((resolve) => server.close(resolve));
  t.after(async () => {
    await stop();
    assert.ok(
      resolve(directory).startsWith(
        resolve(join(tmpdir(), "northline-orders-")),
      ),
    );
    await rm(directory, { recursive: true, force: true });
  });
  let url = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(url + "/api/session/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  let workspace = (
    await (
      await fetch(url + "/api/tracker", { method: "POST", headers: { cookie } })
    ).json()
  ).workspace;
  const upload = await fetch(url + "/api/photos", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      revision: workspace.revision,
      jobId: "NL-2401",
      data: image,
      caption: "Saved brake photo",
      customerVisible: true,
    }),
  });
  assert.equal(upload.status, 201);
  workspace = (await upload.json()).workspace;
  const link = await fetch(url + "/api/workshop/actions", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      revision: workspace.revision,
      action: "create-link",
      jobId: "NL-2401",
    }),
  });
  const token = (await link.json()).portalFragment;
  await stop();
  server = createApp({ dataFile, operatorKey: key });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + "/api/workshop")).status, 401);
  const customer = await fetch(url + "/api/customer/repair", {
    headers: { authorization: "Bearer " + token },
  });
  assert.equal(customer.status, 200);
  const data = await customer.json();
  const photo = await fetch(
    url + "/api/customer/photos/" + data.job.photos[0].id,
    { headers: { authorization: "Bearer " + token } },
  );
  assert.equal(
    Buffer.from(await photo.arrayBuffer()).toString("base64"),
    image,
  );
});
