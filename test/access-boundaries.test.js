import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileStore } from "../lib/file-store.js";
import { createSiteApi, defaultStaffWorkspaceId } from "../lib/site-api.js";
import { createBlobStore } from "../lib/blob-store.js";
const key = "separation-test-operator-key-only";
const request = (path, body, headers = {}) =>
  new Request("https://northline.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const enquiry = () => ({
  requestId: randomUUID(),
  name: "Boundary Rider",
  bike: "Boundary bicycle",
  email: "boundary@example.test",
  phone: "",
  concern: "Rear brake squeals\nPlease inspect the pad alignment.",
  serviceId: "brake",
  collection: false,
  website: "",
});
async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), "northline-boundary-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const storage = createFileStore(join(folder, "records.ndjson"));
  const api = (req, options = {}) =>
    createSiteApi(storage, { operatorKey: key, secure: true, ...options })(req);
  const login = async () =>
    (await api(request("/api/staff/session/login", { key }))).headers
      .get("set-cookie")
      .split(";")[0];
  return { storage, api, login };
}
test("public service menu and request receipt expose no staff records or workspace identifier", async (t) => {
  const { api, storage, login } = await fixture(t);
  const menu = await (await api(request("/api/public/services"))).json();
  assert.equal(menu.services.length, 12);
  assert.deepEqual(Object.keys(menu).sort(), ["portfolio", "services", "shop"]);
  assert.equal(
    menu.services.some((item) => "stock" in item || "mechanic" in item),
    false,
  );
  const input = enquiry(),
    saved = await api(request("/api/public/enquiries", input));
  assert.equal(saved.status, 201, await saved.clone().text());
  const receipt = await saved.json();
  assert.deepEqual(Object.keys(receipt).sort(), [
    "duplicate",
    "estimate",
    "portalFragment",
    "repairId",
  ]);
  assert.equal(receipt.portalFragment.includes(defaultStaffWorkspaceId), false);
  const master = await storage.getWorkspace(defaultStaffWorkspaceId);
  assert.equal(master.accessMode, "staff");
  assert.equal(master.jobs.length, 1);
  const staff = await (
    await api(
      request("/api/staff/workshop", undefined, { cookie: await login() }),
    )
  ).json();
  assert.equal(staff.workspace.jobs[0].bike, input.bike);
  const recipient = await api(
    request("/api/customer/repair", undefined, {
      authorization: "Bearer " + receipt.portalFragment,
    }),
  );
  assert.equal(recipient.status, 200);
  const snapshot = await recipient.json();
  assert.equal(snapshot.job.id, receipt.repairId);
  assert.equal(
    JSON.stringify(snapshot).includes(defaultStaffWorkspaceId),
    false,
  );
  assert.equal(
    "customers" in snapshot ||
      "stock" in snapshot ||
      "internalNotes" in snapshot.job,
    false,
  );
});
test("forged demo cookies, repair references and bearer tokens cannot open private operator records", async (t) => {
  const { api } = await fixture(t);
  const receipt = await (
    await api(request("/api/public/enquiries", enquiry()))
  ).json();
  for (const forged of [
    defaultStaffWorkspaceId,
    receipt.portalFragment.split(".")[0],
  ]) {
    const response = await api(
      request("/api/demo/workshop", undefined, {
        cookie: "northline_demo=" + forged,
      }),
    );
    assert.notEqual(response.status, 200);
    assert.equal((await response.text()).includes("Boundary bicycle"), false);
  }
  for (const path of [
    "workshop",
    "tracker",
    "photos/" + randomUUID(),
    "workshop/export",
  ]) {
    assert.equal(
      (
        await api(
          request("/api/staff/" + path, undefined, {
            cookie: "northline_demo=" + defaultStaffWorkspaceId,
            authorization: "Bearer " + receipt.portalFragment,
          }),
        )
      ).status,
      401,
    );
  }
  assert.equal(
    (
      await api(
        request(
          "/api/staff/workshop/actions",
          { action: "add-note" },
          { authorization: "Bearer " + receipt.portalFragment },
        ),
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await api(
        request("/api/customer/repair", undefined, {
          authorization:
            "Bearer " +
            defaultStaffWorkspaceId +
            "." +
            receipt.portalFragment.split(".")[1],
        }),
      )
    ).status,
    401,
  );
  const demo = await (await api(request("/api/demo/tracker", {}))).json();
  assert.equal(demo.workspace.jobs.length, 3);
  assert.notEqual(demo.workspace.id, defaultStaffWorkspaceId);
});
test("public retries are idempotent including a link-index failure after the repair committed", async (t) => {
  const { api, storage } = await fixture(t),
    input = enquiry();
  const write = storage.setCustomerLink;
  let once = true;
  storage.setCustomerLink = async (...args) => {
    if (once) {
      once = false;
      throw new Error("sensitive internal failure");
    }
    return write(...args);
  };
  const failed = await api(request("/api/public/enquiries", input));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /sensitive/);
  const retry = await api(request("/api/public/enquiries", input));
  assert.equal(retry.status, 200);
  const receipt = await retry.json();
  assert.equal(receipt.duplicate, true);
  assert.equal(
    (await storage.getWorkspace(defaultStaffWorkspaceId)).jobs.length,
    1,
  );
  assert.equal(
    (
      await api(
        request("/api/customer/repair", undefined, {
          authorization: "Bearer " + receipt.portalFragment,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await api(request("/api/public/enquiries", { ...input, bike: "Changed" })))
      .status,
    409,
  );
});
test("public intake rejects forged internal fields, real contact data in portfolio mode and cross-site writes", async (t) => {
  const { api, storage } = await fixture(t);
  for (const changes of [
    { customerId: randomUUID() },
    { internalNotes: "forged" },
    { estimate: 0 },
    { email: "person@example.com" },
    { phone: "1234567890" },
    { serviceId: "unknown" },
  ]) {
    assert.equal(
      (
        await api(
          request("/api/public/enquiries", { ...enquiry(), ...changes }),
        )
      ).status,
      422,
    );
  }
  assert.equal(
    (
      await api(
        request("/api/public/enquiries", enquiry(), {
          origin: "https://other.test",
        }),
      )
    ).status,
    403,
  );
  assert.equal(await storage.getWorkspace(defaultStaffWorkspaceId), null);
});
test("staff sessions persist across fresh handlers, logout revokes them and rotating keys invalidates them", async (t) => {
  const { api, login } = await fixture(t);
  const cookie = await login();
  assert.equal(
    (
      await (
        await api(request("/api/staff/access", undefined, { cookie }))
      ).json()
    ).authenticated,
    true,
  );
  assert.equal(
    (
      await (
        await api(request("/api/staff/access", undefined, { cookie }), {
          operatorKey: key + "rotated",
        })
      ).json()
    ).authenticated,
    false,
  );
  assert.equal(
    (await api(request("/api/staff/session/logout", {}, { cookie }))).status,
    200,
  );
  assert.equal(
    (await api(request("/api/staff/workshop", undefined, { cookie }))).status,
    401,
  );
});
test("missing staff credentials fail closed while the explicit demo and service menu remain usable", async (t) => {
  const { api } = await fixture(t);
  assert.deepEqual(
    await (
      await api(request("/api/staff/access"), { operatorKey: undefined })
    ).json(),
    { mode: "private", authenticated: false, configured: false },
  );
  assert.equal(
    (await api(request("/api/staff/workshop"), { operatorKey: undefined }))
      .status,
    503,
  );
  assert.equal(
    (
      await api(request("/api/public/enquiries", enquiry()), {
        operatorKey: undefined,
      })
    ).status,
    503,
  );
  assert.equal(
    (await api(request("/api/demo/tracker", {}), { operatorKey: undefined }))
      .status,
    201,
  );
});
test("cloud staff sign-in uses durable sessions across independently constructed adapters", async () => {
  const rows = new Map();
  let version = 0;
  const store = {
    get: async (key) => structuredClone(rows.get(key)?.data || null),
    getWithMetadata: async (key) => structuredClone(rows.get(key) || null),
    delete: async (key) => rows.delete(key),
    setJSON: async (key, data, options) => {
      const prior = rows.get(key);
      if (
        (options.onlyIfNew && prior) ||
        (options.onlyIfMatch && options.onlyIfMatch !== prior?.etag)
      )
        return { modified: false };
      const etag = String(++version);
      rows.set(key, { data: structuredClone(data), etag });
      return { modified: true, etag };
    },
  };
  const api = (req) =>
    createSiteApi(createBlobStore(store), { operatorKey: key, secure: true })(
      req,
      "127.0.0.1",
    );
  for (let i = 0; i < 8; i++)
    assert.equal(
      (await api(request("/api/staff/session/login", { key: "wrong" }))).status,
      401,
    );
  assert.equal(
    (await api(request("/api/staff/session/login", { key }))).status,
    429,
  );
  rows.clear();
  const login = await api(request("/api/staff/session/login", { key }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(
    login.headers.get("set-cookie"),
    /HttpOnly; SameSite=Strict.*Secure/,
  );
  assert.equal(
    (await api(request("/api/staff/tracker", {}, { cookie }))).status,
    201,
  );
  assert.equal(
    (await api(request("/api/staff/workshop", undefined, { cookie }))).status,
    200,
  );
  await api(request("/api/staff/session/logout", {}, { cookie }));
  assert.equal(
    (await api(request("/api/staff/workshop", undefined, { cookie }))).status,
    401,
  );
});
test("staff initialization preserves the visitor cookie and rejects older permanent records in the demo", async (t) => {
  const { api, storage, login } = await fixture(t);
  const initial = await api(
    request("/api/staff/tracker", {}, { cookie: await login() }),
  );
  assert.equal(initial.status, 201);
  assert.equal(initial.headers.get("set-cookie"), null);
  const workspace = await storage.getWorkspace(defaultStaffWorkspaceId);
  delete workspace.accessMode;
  await storage.setWorkspace(workspace.id, workspace);
  assert.equal(
    (
      await api(
        request("/api/demo/workshop", undefined, {
          cookie: "northline_demo=" + workspace.id,
        }),
      )
    ).status,
    401,
  );
});
test("an identical public retry cannot restore a staff-revoked customer link", async (t) => {
  const { api, storage, login } = await fixture(t),
    input = enquiry();
  const receipt = await (
    await api(request("/api/public/enquiries", input))
  ).json();
  const workspace = await storage.getWorkspace(defaultStaffWorkspaceId);
  const revoke = await api(
    request(
      "/api/staff/workshop/actions",
      {
        action: "revoke-link",
        jobId: receipt.repairId,
        revision: workspace.revision,
      },
      { cookie: await login() },
    ),
  );
  assert.equal(revoke.status, 200);
  assert.equal(
    (await api(request("/api/public/enquiries", input))).status,
    409,
  );
  assert.equal(
    (
      await api(
        request("/api/customer/repair", undefined, {
          authorization: "Bearer " + receipt.portalFragment,
        }),
      )
    ).status,
    401,
  );
});
