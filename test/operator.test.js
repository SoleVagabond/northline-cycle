import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createOperatorAccess } from "../lib/operator-auth.js";
import { createApp } from "../server.js";
const key = "local-test-only-operator-key";
test("protected workshop accepts only its configured HTTPS origin behind a proxy", async () => {
  const server = createApp({
    operatorKey: key,
    publicOrigin: "https://workshop.example",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const local = `http://127.0.0.1:${server.address().port}`;
    const request = (origin) =>
      fetch(local + "/api/session/login", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
    assert.equal((await request("https://other.example")).status, 403);
    assert.equal((await request("https://workshop.example")).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.throws(
    () =>
      createApp({ operatorKey: key, publicOrigin: "http://workshop.example" }),
    /exact HTTPS/,
  );
});
test("operator sessions are HttpOnly, expire and reject cross-origin sign-in", async () => {
  let time = Date.now();
  const access = createOperatorAccess(key, { now: () => time, secure: true });
  const req = (path, body, cookie = "", origin = "https://private.test") =>
    new Request("https://private.test" + path, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", cookie, origin },
      body: body ? JSON.stringify(body) : undefined,
    });
  assert.equal(
    (await access(req("/api/session/login", { key }, "", "https://other.test")))
      .status,
    403,
  );
  const response = await access(req("/api/session/login", { key }));
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict.*Secure/);
  assert.equal(
    await access(req("/api/workshop", undefined, cookie.split(";")[0])),
    null,
  );
  time += 9 * 3600000;
  assert.equal(
    (await access(req("/api/workshop", undefined, cookie.split(";")[0])))
      .status,
    401,
  );
});
test("operator login throttles repeated wrong keys without issuing a session", async () => {
  const access = createOperatorAccess(key);
  for (let i = 0; i < 8; i++)
    assert.equal(
      (
        await access(
          new Request("http://local.test/api/session/login", {
            method: "POST",
            body: JSON.stringify({ key: "wrong" }),
          }),
        )
      ).status,
      401,
    );
  assert.equal(
    (
      await access(
        new Request("http://local.test/api/session/login", {
          method: "POST",
          body: JSON.stringify({ key }),
        }),
      )
    ).status,
    429,
  );
});
test("protected local records survive logout and server restart without portfolio expiry", async () => {
  const folder = await mkdtemp(join(tmpdir(), "northline-private-"));
  let server;
  const open = async () => {
    server = createApp({
      dataFile: join(folder, "records.ndjson"),
      operatorKey: key,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  const close = () => new Promise((resolve) => server.close(resolve));
  try {
    let origin = await open();
    assert.equal((await fetch(origin + "/api/workshop")).status, 401);
    const login = async () => {
      const response = await fetch(origin + "/api/session/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      assert.equal(response.status, 200);
      return response.headers.get("set-cookie").split(";")[0];
    };
    let cookie = await login();
    const start = await fetch(origin + "/api/tracker", {
      method: "POST",
      headers: { cookie },
    });
    const workspace = (await start.json()).workspace;
    assert.match(workspace.expiresAt, /^9999/);
    const created = await fetch(origin + "/api/workshop/actions", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        revision: workspace.revision,
        requestId: "7a11399d-0b9c-4b6d-a28f-b455fb1b8260",
        bikeId: "city",
        issueId: "brakes",
        serviceId: "brake",
        collection: false,
        rider: "Private test customer",
        bike: "Private test bike",
        issue: "Brake adjustment",
      }),
    });
    assert.equal(created.status, 200);
    await fetch(origin + "/api/session/logout", {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(
      (await fetch(origin + "/api/workshop", { headers: { cookie } })).status,
      401,
    );
    await close();
    origin = await open();
    cookie = await login();
    const saved = await fetch(origin + "/api/workshop", {
      headers: { cookie },
    });
    assert.equal(
      (await saved.json()).workspace.jobs[0].bike,
      "Private test bike",
    );
  } finally {
    if (server?.listening) await close();
    await rm(folder, { recursive: true, force: true });
  }
});
