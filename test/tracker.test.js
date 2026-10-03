import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../server.js";
import { createApi } from "../lib/api.js";
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "northline-tracker-"));
  const dataFile = join(directory, "enquiries.ndjson");
  let server;
  async function start() {
    server = createApp({ dataFile });
    await new Promise((done) => server.listen(0, "127.0.0.1", done));
    return `http://127.0.0.1:${server.address().port}`;
  }
  t.after(async () => {
    await new Promise((done) => server.close(done));
    if (
      !resolve(directory).startsWith(
        resolve(join(tmpdir(), "northline-tracker-")),
      )
    )
      throw new Error("Unsafe cleanup path");
    await rm(directory, { recursive: true, force: true });
  });
  return {
    url: await start(),
    restart: async () => {
      await new Promise((done) => server.close(done));
      return start();
    },
  };
}
async function begin(url) {
  const response = await fetch(url + "/api/tracker", { method: "POST" });
  assert.equal(response.status, 201);
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    workspace: (await response.json()).workspace,
  };
}
const change = (
  url,
  cookie,
  revision,
  action,
  role = "workshop",
  jobId = "NL-2401",
) =>
  fetch(url + "/api/tracker/actions", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, revision, action, role }),
  });
test("new tracker creates three fictional jobs and a protected demo cookie", async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(url + "/api/tracker", { method: "POST" });
  assert.equal(response.status, 201);
  assert.match(response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/);
  const { workspace } = await response.json();
  assert.equal(workspace.jobs.length, 3);
  assert.equal(workspace.jobs[0].status, "approval");
  assert.equal(workspace.revision, 1);
});
test("approval gates the repair and the full lifecycle ends at collection", async (t) => {
  const { url } = await fixture(t);
  const { cookie } = await begin(url);
  assert.equal((await change(url, cookie, 1, "advance")).status, 422);
  assert.equal((await change(url, cookie, 1, "approve")).status, 422);
  const approved = await change(url, cookie, 1, "approve", "customer");
  assert.equal(approved.status, 200);
  let workspace = (await approved.json()).workspace;
  assert.equal(workspace.jobs[0].approved, true);
  assert.equal(workspace.jobs[0].status, "repairing");
  for (const expected of ["quality", "ready", "collected"]) {
    const response = await change(url, cookie, workspace.revision, "advance");
    assert.equal(response.status, 200);
    workspace = (await response.json()).workspace;
    assert.equal(workspace.jobs[0].status, expected);
  }
  assert.equal(
    (await change(url, cookie, workspace.revision, "advance")).status,
    422,
  );
  assert.equal(workspace.jobs[0].history.length, 7);
});
test("separate visitors cannot alter each other’s sample progress", async (t) => {
  const { url } = await fixture(t);
  const first = await begin(url);
  const second = await begin(url);
  assert.notEqual(first.cookie, second.cookie);
  await change(url, first.cookie, 1, "approve", "customer");
  const untouched = await fetch(url + "/api/tracker", {
    headers: { Cookie: second.cookie },
  });
  assert.equal((await untouched.json()).workspace.jobs[0].status, "approval");
});
test("saved repair progress survives a server restart", async (t) => {
  const setup = await fixture(t);
  const { cookie } = await begin(setup.url);
  await change(setup.url, cookie, 1, "approve", "customer");
  const nextUrl = await setup.restart();
  const response = await fetch(nextUrl + "/api/tracker", {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).workspace.jobs[0].status, "repairing");
});
test("stale and simultaneous updates are rejected without duplicating history locally", async (t) => {
  const { url } = await fixture(t);
  const { cookie } = await begin(url);
  const responses = await Promise.all([
    change(url, cookie, 1, "approve", "customer"),
    change(url, cookie, 1, "approve", "customer"),
  ]);
  assert.deepEqual(
    responses.map((response) => response.status).sort(),
    [200, 409],
  );
  assert.equal((await change(url, cookie, 1, "advance")).status, 409);
  const response = await fetch(url + "/api/tracker", {
    headers: { Cookie: cookie },
  });
  const { workspace } = await response.json();
  assert.equal(workspace.revision, 2);
  assert.equal(workspace.jobs[0].history.length, 4);
});
test("customer cannot advance the workbench; reset creates fresh sample jobs", async (t) => {
  const { url } = await fixture(t);
  const { cookie } = await begin(url);
  assert.equal(
    (await change(url, cookie, 1, "advance", "customer", "NL-2402")).status,
    422,
  );
  const reset = await fetch(url + "/api/tracker/reset", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(reset.status, 201);
  assert.notEqual(reset.headers.get("set-cookie").split(";")[0], cookie);
  assert.equal((await reset.json()).workspace.revision, 1);
});
test("missing session, unknown job, and cross-origin writes are rejected", async (t) => {
  const { url } = await fixture(t);
  const { cookie } = await begin(url);
  assert.equal((await change(url, "", 1, "approve", "customer")).status, 401);
  assert.equal(
    (await change(url, cookie, 1, "approve", "customer", "NL-9999")).status,
    404,
  );
  assert.equal(
    (
      await fetch(url + "/api/tracker/reset", {
        method: "POST",
        headers: { Cookie: cookie, Origin: "https://unrelated.example" },
      })
    ).status,
    403,
  );
});
test("tracker storage failure does not create a successful session", async () => {
  const api = createApi({
    getWorkspace: async () => null,
    setWorkspace: async () => {
      throw new Error("Storage unavailable");
    },
  });
  const response = await api(
    new Request("https://demo.example/api/tracker", { method: "POST" }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("set-cookie"), null);
});
