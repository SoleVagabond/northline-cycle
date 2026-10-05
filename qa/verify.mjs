import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { workshopDate, qualityChecks } from "../lib/services.js";
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
    "/lib/quotes.js",
    "/lib/decision-view.js",
  ])
    assert.equal((await fetch(origin + path)).status, 200);
  const image = await fetch(origin + "/assets/share.jpg");
  assert.match(image.headers.get("content-type"), /^image\/jpeg/);
  assert.deepEqual(
    [...new Uint8Array(await image.arrayBuffer()).slice(0, 3)],
    [255, 216, 255],
  );
});
let decisionWorkspace;
const decisionJob = () =>
  decisionWorkspace.jobs.find((job) => job.id === "NL-2401");
async function decisionAction(action, role, choices = {}) {
  const response = await fetch(origin + "/api/tracker/actions", {
    method: "POST",
    headers: { cookie: demoCookie, "content-type": "application/json" },
    body: JSON.stringify({
      jobId: "NL-2401",
      revision: decisionWorkspace.revision,
      action,
      role,
      ...choices,
    }),
  });
  if (response.status === 200)
    decisionWorkspace = (await response.json()).workspace;
  return response;
}
await check(
  "Revised parts and labour pause previously approved work",
  async () => {
    const response = await fetch(origin + "/api/tracker", {
      headers: { cookie: demoCookie },
    });
    assert.equal(response.status, 200);
    decisionWorkspace = (await response.json()).workspace;
    assert.equal(
      (
        await decisionAction("revise", "workshop", {
          partsId: "pads",
          labourId: "adjustment",
          reasonId: "inspection",
        })
      ).status,
      200,
    );
    assert.equal(decisionJob().status, "approval");
    assert.equal(decisionJob().estimate, 125);
    assert.equal(decisionJob().quotes[0].decision, "approved");
    assert.equal(decisionJob().quotes[1].version, 2);
  },
);
await check(
  "Old estimate approval and unapproved work are rejected",
  async () => {
    const revision = decisionWorkspace.revision;
    assert.equal(
      (await decisionAction("approve", "customer", { quoteVersion: 1 })).status,
      422,
    );
    assert.equal((await decisionAction("advance", "workshop")).status, 422);
    assert.equal(decisionWorkspace.revision, revision);
    assert.equal(decisionJob().status, "approval");
  },
);
await check(
  "Declined estimate can be replaced and the new version approved",
  async () => {
    assert.equal(
      (await decisionAction("decline", "customer", { quoteVersion: 2 })).status,
      200,
    );
    assert.equal(decisionJob().status, "declined");
    assert.equal(
      (
        await decisionAction("revise", "workshop", {
          partsId: "tube",
          labourId: "standard",
          reasonId: "alternative",
        })
      ).status,
      200,
    );
    assert.equal(decisionJob().estimate, 92);
    assert.equal(
      (await decisionAction("approve", "customer", { quoteVersion: 3 })).status,
      200,
    );
    assert.deepEqual(
      decisionJob().quotes.map((quote) => quote.decision),
      ["approved", "declined", "approved"],
    );
  },
);
await check(
  "Parts wait resumes at the workbench and remains saved",
  async () => {
    assert.equal((await decisionAction("wait-parts", "workshop")).status, 200);
    assert.equal(decisionJob().status, "waiting_parts");
    assert.equal((await decisionAction("advance", "workshop")).status, 422);
    assert.equal(
      (await decisionAction("parts-arrived", "workshop")).status,
      200,
    );
    const response = await fetch(origin + "/api/tracker", {
      headers: { cookie: demoCookie },
    });
    assert.equal(response.status, 200);
    decisionWorkspace = (await response.json()).workspace;
    assert.equal(decisionJob().status, "repairing");
    assert.equal(decisionJob().quotes.length, 3);
  },
);
await check(
  "Cancellation closes the repair and prevents further changes",
  async () => {
    assert.equal(
      (
        await decisionAction("cancel", "workshop", {
          reasonId: "customer-request",
        })
      ).status,
      200,
    );
    const historyLength = decisionJob().history.length;
    assert.equal((await decisionAction("advance", "workshop")).status, 422);
    const response = await fetch(origin + "/api/tracker", {
      headers: { cookie: demoCookie },
    });
    assert.equal(response.status, 200);
    decisionWorkspace = (await response.json()).workspace;
    assert.equal(decisionJob().status, "cancelled");
    assert.equal(decisionJob().history.length, historyLength);
  },
);
await check(
  "Workshop application loads and backend modules remain private",
  async () => {
    const page = await fetch(origin + "/workshop.html");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Services &(?:amp;)? prices/);
    for (const path of [
      "/lib/operator-auth.js",
      "/lib/workshop-domain.js",
      "/data/tracker/example.json",
    ])
      assert.equal((await fetch(origin + path)).status, 404);
  },
);
let operations, operationsCookie, operationsId;
async function operation(path, body) {
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    headers: { cookie: operationsCookie, "content-type": "application/json" },
    body: body
      ? JSON.stringify({ ...body, revision: operations.revision })
      : undefined,
  });
  const data = await response.json();
  if (response.ok && data.workspace) operations = data.workspace;
  return { status: response.status, ...data };
}
const operationJob = () =>
  operations.jobs.find((job) => job.id === operationsId);
await check(
  "Full catalog and inventory are connected to a saved workspace",
  async () => {
    const start = await fetch(origin + "/api/tracker", { method: "POST" });
    operationsCookie = start.headers.get("set-cookie").split(";")[0];
    operations = (await start.json()).workspace;
    const result = await operation("/api/workshop");
    assert.equal(result.status, 200);
    assert.equal(result.catalogue.length, 12);
    assert.equal(result.stock.length, 6);
  },
);
await check(
  "Workshop intake prices a repair and repeated requests do not duplicate it",
  async () => {
    const input = {
      action: "create",
      requestId: randomUUID(),
      bikeId: "city",
      issueId: "brakes",
      serviceId: "brake",
      collection: false,
    };
    const created = await operation("/api/workshop/actions", input);
    assert.equal(created.status, 200);
    operationsId = created.repairId;
    assert.equal(operationJob().estimate, 40);
    assert.equal((await operation("/api/workshop/actions", input)).status, 200);
    assert.equal(operations.jobs.length, 4);
  },
);
await check(
  "Scheduling and multi-part approval reserve stock at the exact quoted total",
  async () => {
    assert.equal(
      (
        await operation("/api/workshop/actions", {
          action: "schedule",
          jobId: operationsId,
          dueDate: workshopDate(),
          mechanicId: "lee",
          priority: "high",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "advance",
          role: "workshop",
          jobId: operationsId,
          enforceChecklist: true,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "revise",
          role: "workshop",
          jobId: operationsId,
          partLines: [
            { id: "pads", quantity: 1 },
            { id: "tube", quantity: 2 },
          ],
          labourId: "adjustment",
          reasonId: "inspection",
        })
      ).status,
      200,
    );
    assert.equal(operationJob().estimate, 109);
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "approve",
          role: "customer",
          jobId: operationsId,
          quoteVersion: 2,
        })
      ).status,
      200,
    );
    const result = await operation("/api/workshop");
    assert.equal(result.stock.find((part) => part.id === "pads").reserved, 1);
    assert.equal(result.stock.find((part) => part.id === "tube").reserved, 2);
  },
);
await check(
  "Completing work consumes stock and quality checks gate release",
  async () => {
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "advance",
          role: "workshop",
          jobId: operationsId,
          enforceChecklist: true,
        })
      ).status,
      200,
    );
    assert.equal(operationJob().status, "quality");
    const result = await operation("/api/workshop");
    assert.equal(result.stock.find((part) => part.id === "pads").onHand, 3);
    assert.equal(result.stock.find((part) => part.id === "tube").onHand, 4);
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "advance",
          role: "workshop",
          jobId: operationsId,
          enforceChecklist: true,
        })
      ).status,
      422,
    );
    for (const check of qualityChecks)
      assert.equal(
        (
          await operation("/api/workshop/actions", {
            action: "check",
            jobId: operationsId,
            checkId: check.id,
            passed: true,
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "advance",
          role: "workshop",
          jobId: operationsId,
          enforceChecklist: true,
        })
      ).status,
      200,
    );
    assert.equal(operationJob().status, "ready");
  },
);
await check(
  "Payment record, collection, quotes and stock ledger survive reload",
  async () => {
    assert.equal(
      (
        await operation("/api/workshop/actions", {
          action: "record-payment",
          jobId: operationsId,
          method: "cash",
        })
      ).status,
      200,
    );
    assert.equal(operationJob().payment.amount, 109);
    assert.equal(
      (
        await operation("/api/tracker/actions", {
          action: "advance",
          role: "workshop",
          jobId: operationsId,
          enforceChecklist: true,
        })
      ).status,
      200,
    );
    await operation("/api/workshop");
    assert.equal(operationJob().status, "collected");
    assert.equal(operationJob().quotes.length, 2);
    assert.equal(
      operations.stockMovements.filter((entry) => entry.jobId === operationsId)
        .length,
      2,
    );
    assert.equal(
      (
        await operation("/api/workshop/actions", {
          action: "record-payment",
          jobId: operationsId,
          method: "cash",
        })
      ).status,
      422,
    );
  },
);
await check(
  "Edited prices reach the website while stale updates are rejected",
  async () => {
    const prior = operations.revision;
    assert.equal(
      (
        await operation("/api/workshop/actions", {
          action: "catalog",
          serviceId: "tune",
          price: 90,
          enabled: true,
        })
      ).status,
      200,
    );
    const menu = await operation("/api/services");
    assert.equal(menu.services.find((item) => item.id === "tune").price, 90);
    const stale = await fetch(origin + "/api/workshop/actions", {
      method: "POST",
      headers: { cookie: operationsCookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "receive-stock",
        partId: "pads",
        quantity: 1,
        revision: prior,
      }),
    });
    assert.equal(stale.status, 409);
    assert.equal(operationJob().payment.amount, 109);
  },
);
console.log(`${passed} checks passed.`);
