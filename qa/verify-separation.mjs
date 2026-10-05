import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
const target = new URL(process.argv[2] || "http://127.0.0.1:8788");
if (
  !(
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
    target.protocol === "http:"
  ) &&
  !(
    process.argv.includes("--hosted") &&
    target.origin === "https://northline-cycle-devin.netlify.app"
  )
)
  throw Error("Use loopback or the owned Northline deployment with --hosted.");
const index = process.argv.indexOf("--key-file");
const key =
  index >= 0
    ? (await readFile(process.argv[index + 1], "utf8")).match(
        /^Workshop key: (.+)$/m,
      )?.[1]
    : process.env.NORTHLINE_OPERATOR_KEY;
if (!key)
  throw Error(
    "Supply NORTHLINE_OPERATOR_KEY or --key-file pointing to the private staff access file.",
  );
let cookie = "",
  passed = 0,
  workspace,
  receipt;
const call = (path, input, headers = {}) =>
  fetch(target.origin + path, {
    method: input === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
const check = async (name, run) => {
  await run();
  passed++;
  console.log(`PASS ${name}`);
};
await check(
  "Customer website, protected workshop shell and explicit demo are separate",
  async () => {
    const home = await (await call("/")).text();
    assert.match(home, /customer-site.js/);
    assert.doesNotMatch(home, /tracker.js|workshop.js/);
    const sample = await (await call("/demo/")).text();
    assert.match(sample, /Portfolio demo/);
    assert.equal((await call("/workshop.html")).status, 200);
  },
);
await check(
  "Published catalogue contains active scopes and prices without internal records",
  async () => {
    const data = await (await call("/api/public/services")).json();
    assert.ok(data.services.length >= 12);
    assert.equal(data.portfolio, true);
    assert.deepEqual(Object.keys(data).sort(), [
      "portfolio",
      "services",
      "shop",
    ]);
  },
);
await check("Direct staff reads and writes require a session", async () => {
  assert.equal((await call("/api/staff/workshop")).status, 401);
  assert.equal(
    (await call("/api/staff/workshop/actions", { action: "create" })).status,
    401,
  );
});
const input = {
  requestId: randomUUID(),
  name: "Fictional Access Review",
  bike: "Access review bicycle",
  concern: "Rear brake inspection\nFictional verification request",
  serviceId: "brake",
  email: "review@example.test",
  phone: "",
  collection: false,
  website: "",
};
await check(
  "Public request saves one private repair and an opaque scoped receipt",
  async () => {
    const response = await call("/api/public/enquiries", input);
    assert.equal(response.status, 201);
    receipt = await response.json();
    assert.deepEqual(Object.keys(receipt).sort(), [
      "duplicate",
      "estimate",
      "portalFragment",
      "repairId",
    ]);
    const repeated = await call("/api/public/enquiries", input);
    assert.equal(repeated.status, 200);
    assert.equal(
      (await repeated.json()).portalFragment,
      receipt.portalFragment,
    );
  },
);
await check(
  "Customer recipient sees only its repair without a staff session",
  async () => {
    const response = await call("/api/customer/repair", undefined, {
      authorization: "Bearer " + receipt.portalFragment,
    });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.job.id, receipt.repairId);
    assert.equal(data.job.bike, input.bike);
    assert.equal("customers" in data || "internalNotes" in data.job, false);
  },
);
await check(
  "A durable staff session opens the request without replacing the demo cookie",
  async () => {
    const login = await call("/api/staff/session/login", { key });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    cookie = login.headers.get("set-cookie").split(";")[0];
    const initialize = await call("/api/staff/tracker", {}, { cookie });
    assert.ok(initialize.ok);
    assert.equal(initialize.headers.get("set-cookie"), null);
    const response = await call("/api/staff/workshop", undefined, { cookie });
    assert.equal(response.status, 200);
    workspace = (await response.json()).workspace;
    assert.equal(
      workspace.jobs.filter((job) => job.id === receipt.repairId).length,
      1,
    );
    assert.notEqual(receipt.portalFragment.split(".")[0], workspace.id);
  },
);
async function action(input) {
  const response = await call(
    "/api/staff/workshop/actions",
    { ...input, revision: workspace.revision },
    { cookie },
  );
  assert.equal(response.status, 200);
  workspace = (await response.json()).workspace;
}
await check(
  "Only explicitly shared updates cross the customer boundary",
  async () => {
    await action({
      action: "inspection-record",
      jobId: receipt.repairId,
      condition: "Fictional check",
      diagnosis: "PRIVATE ACCESS REVIEW NOTE",
    });
    await action({
      action: "customer-update",
      jobId: receipt.repairId,
      note: "Your fictional repair request has been received.",
    });
    const data = await (
      await call("/api/customer/repair", undefined, {
        authorization: "Bearer " + receipt.portalFragment,
      })
    ).text();
    assert.match(data, /fictional repair request has been received/);
    assert.doesNotMatch(data, /PRIVATE ACCESS REVIEW NOTE/);
  },
);
await check(
  "Forged demo cookies and customer bearer tokens cannot open staff data",
  async () => {
    assert.equal(
      (
        await call("/api/demo/workshop", undefined, {
          cookie: "northline_demo=" + workspace.id,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await call("/api/staff/workshop", undefined, {
          authorization: "Bearer " + receipt.portalFragment,
        })
      ).status,
      401,
    );
  },
);
await check(
  "Sample visitor records stay independent from the private request",
  async () => {
    const response = await call("/api/demo/tracker", {});
    assert.equal(response.status, 201);
    const demo = (await response.json()).workspace;
    assert.equal(demo.jobs.length, 3);
    assert.notEqual(demo.id, workspace.id);
    assert.equal(
      demo.jobs.some((job) => job.id === receipt.repairId),
      false,
    );
  },
);
await check(
  "Revocation blocks the customer link and receipt retry cannot restore it",
  async () => {
    await action({ action: "revoke-link", jobId: receipt.repairId });
    assert.equal(
      (
        await call("/api/customer/repair", undefined, {
          authorization: "Bearer " + receipt.portalFragment,
        })
      ).status,
      401,
    );
    assert.equal((await call("/api/public/enquiries", input)).status, 409);
  },
);
await check(
  "The fictional review request is closed and sign-out revokes staff access",
  async () => {
    const canceled = await call(
      "/api/staff/tracker/actions",
      {
        revision: workspace.revision,
        jobId: receipt.repairId,
        role: "workshop",
        action: "cancel",
        reasonId: "customer-request",
      },
      { cookie },
    );
    assert.equal(canceled.status, 200);
    assert.equal(
      (await call("/api/staff/session/logout", {}, { cookie })).status,
      200,
    );
    assert.equal(
      (await call("/api/staff/workshop", undefined, { cookie })).status,
      401,
    );
  },
);
console.log(
  `${passed} audience-separation integration checks passed against ${target.origin}. Fictional records only; no messages, bookings or charges.`,
);
