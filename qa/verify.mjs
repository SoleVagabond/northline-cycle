import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const target = new URL(process.argv[2] || "http://127.0.0.1:8788");
const local =
  ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) &&
  target.protocol === "http:";
const hosted =
  process.argv.includes("--hosted") &&
  target.protocol === "https:" &&
  target.hostname.endsWith(".netlify.app");
if (!local && !hosted)
  throw new Error(
    "Use loopback, or --hosted with your own HTTPS Netlify demo.",
  );
const origin = target.origin;
let passed = 0;
let createdRepair;
let createdCookie;
const createdInput = {
  requestId: randomUUID(),
  bikeId: "city",
  issueId: "brakes",
  serviceId: "tune",
  collection: true,
  slot: "flexible",
};
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
await check("Homepage loads", async () => {
  const response = await fetch(origin);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Northline Cycle Co/);
});
await check("Catalogue has six services", async () => {
  const response = await fetch(origin + "/api/services");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).services.length, 6);
});
await check(
  "Valid demo enquiry receives a persisted-success reference",
  async () => {
    const response = await fetch(origin + "/api/enquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createdInput),
    });
    assert.equal(response.status, 201);
    createdCookie = response.headers.get("set-cookie").split(";")[0];
    const body = await response.json();
    createdRepair = body;
    assert.equal(body.estimate, 80);
    assert.match(body.id, /^[a-f0-9-]{36}$/);
  },
);
await check("Invalid request is rejected", async () => {
  const response = await fetch(origin + "/api/enquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 422);
});
await check("Internal files are private", async () => {
  for (const path of ["/server.js", "/data/enquiries.ndjson", "/package.json"])
    assert.equal((await fetch(origin + path)).status, 404);
});
let demoCookie;
let seed;
await check("Tracker creates a separate three-repair workspace", async () => {
  const response = await fetch(origin + "/api/tracker", { method: "POST" });
  assert.equal(response.status, 201);
  demoCookie = response.headers.get("set-cookie").split(";")[0];
  seed = (await response.json()).workspace;
  assert.equal(seed.jobs.length, 3);
});
await check("Customer approval is saved and can be reloaded", async () => {
  const response = await fetch(origin + "/api/tracker/actions", {
    method: "POST",
    headers: { cookie: demoCookie, "content-type": "application/json" },
    body: JSON.stringify({
      jobId: "NL-2401",
      role: "customer",
      action: "approve",
      revision: seed.revision,
    }),
  });
  assert.equal(response.status, 200);
  const reloaded = await fetch(origin + "/api/tracker", {
    headers: { cookie: demoCookie },
  });
  assert.equal(reloaded.status, 200);
  assert.equal((await reloaded.json()).workspace.jobs[0].status, "repairing");
});
await check("A stale update cannot overwrite saved progress", async () => {
  const response = await fetch(origin + "/api/tracker/actions", {
    method: "POST",
    headers: { cookie: demoCookie, "content-type": "application/json" },
    body: JSON.stringify({
      jobId: "NL-2401",
      role: "customer",
      action: "approve",
      revision: seed.revision,
    }),
  });
  assert.equal(response.status, 409);
});
await check(
  "The submitted request completes all seven repair stages",
  async () => {
    let workspace = createdRepair.workspace;
    for (const [action, role] of [
      ["advance", "workshop"],
      ["advance", "workshop"],
      ["approve", "customer"],
      ["advance", "workshop"],
      ["advance", "workshop"],
      ["advance", "workshop"],
    ]) {
      const response = await fetch(origin + "/api/tracker/actions", {
        method: "POST",
        headers: { cookie: createdCookie, "content-type": "application/json" },
        body: JSON.stringify({
          jobId: createdRepair.repairId,
          revision: workspace.revision,
          action,
          role,
        }),
      });
      assert.equal(response.status, 200);
      workspace = (await response.json()).workspace;
    }
    const response = await fetch(origin + "/api/tracker", {
      headers: { cookie: createdCookie },
    });
    assert.equal(response.status, 200);
    const job = (await response.json()).workspace.jobs.find(
      (item) => item.id === createdRepair.repairId,
    );
    assert.equal(job.status, "collected");
    assert.equal(job.history.length, 7);
  },
);
await check(
  "Repeating a saved request does not create a duplicate",
  async () => {
    const response = await fetch(origin + "/api/enquiries", {
      method: "POST",
      headers: { cookie: createdCookie, "content-type": "application/json" },
      body: JSON.stringify(createdInput),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.repairId, createdRepair.repairId);
    assert.equal(result.workspace.jobs.length, 4);
  },
);
await check("Personal contact fields are rejected", async () => {
  const response = await fetch(origin + "/api/enquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...createdInput, email: "qa@example.test" }),
  });
  assert.equal(response.status, 422);
});
await check("Case study, favicon, and sharing image load", async () => {
  for (const path of [
    "/case-study.html",
    "/project-brief.md",
    "/assets/favicon.svg",
    "/assets/share.jpg",
  ])
    assert.equal((await fetch(origin + path)).status, 200);
  const image = await fetch(origin + "/assets/share.jpg");
  assert.match(image.headers.get("content-type"), /^image\/jpeg/);
  assert.deepEqual(
    [...new Uint8Array(await image.arrayBuffer()).slice(0, 3)],
    [255, 216, 255],
  );
});
console.log(`${passed} checks passed.`);
