import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, transitionJob } from "../lib/repairs.js";
import { quoteFor } from "../lib/quotes.js";
import { createApi } from "../lib/api.js";

const now = new Date("2026-10-04T18:00:00Z");
const sample = () => createWorkspace("sample", now).jobs[0];
const revise = (job, partsId = "pads", labourId = "adjustment") =>
  transitionJob(
    job,
    {
      role: "workshop",
      action: "revise",
      partsId,
      labourId,
      reasonId: "inspection",
    },
    now,
  );
const approve = (job) =>
  transitionJob(
    job,
    {
      role: "customer",
      action: "approve",
      quoteVersion: quoteFor(job).version,
    },
    now,
  );

test("revised estimates calculate controlled prices and retain the original without mutation", () => {
  const original = sample();
  const snapshot = JSON.stringify(original);
  const job = revise(original);
  assert.equal(job.estimate, 125);
  assert.equal(quoteFor(job).labour, 85);
  assert.equal(quoteFor(job).collection, 15);
  assert.equal(quoteFor(job).parts[0].price, 25);
  assert.equal(job.quotes[0].total, 80);
  assert.equal(job.quotes[0].decision, "superseded");
  assert.equal(quoteFor(job).version, 2);
  assert.equal(job.history.at(-1).role, "workshop");
  assert.equal(job.history.at(-1).quoteVersion, 2);
  assert.equal(JSON.stringify(original), snapshot);
});
test("changing an approved estimate pauses work and requires the exact new version", () => {
  const original = approve(sample());
  const job = revise(original);
  assert.equal(job.approved, false);
  assert.equal(job.status, "approval");
  assert.equal(job.quotes[0].decision, "approved");
  assert.throws(
    () =>
      transitionJob(job, {
        role: "customer",
        action: "approve",
        quoteVersion: 1,
      }),
    /estimate changed/,
  );
  assert.throws(
    () => transitionJob(job, { role: "customer", action: "approve" }),
    /estimate changed/,
  );
  assert.throws(
    () => transitionJob(job, { role: "workshop", action: "advance" }),
    /unavailable/,
  );
  assert.equal(approve(job).status, "repairing");
  assert.equal(quoteFor(approve(job)).decision, "approved");
});
test("declining and offering an alternative preserve each customer decision", () => {
  const quoted = revise(sample());
  const declined = transitionJob(
    quoted,
    { role: "customer", action: "decline", quoteVersion: 2 },
    now,
  );
  assert.equal(declined.status, "declined");
  assert.equal(quoteFor(declined).decision, "declined");
  assert.throws(
    () => transitionJob(declined, { role: "workshop", action: "advance" }),
    /unavailable/,
  );
  const alternative = transitionJob(
    declined,
    {
      role: "workshop",
      action: "revise",
      partsId: "tube",
      labourId: "standard",
      reasonId: "alternative",
    },
    now,
  );
  assert.equal(alternative.estimate, 92);
  assert.equal(alternative.quotes[1].decision, "declined");
  assert.equal(quoteFor(alternative).version, 3);
  assert.equal(approve(alternative).status, "repairing");
});
test("waiting for parts resumes only approved work and cannot skip to ride check", () => {
  const job = approve(revise(sample()));
  const waiting = transitionJob(
    job,
    { role: "workshop", action: "wait-parts" },
    now,
  );
  assert.equal(waiting.status, "waiting_parts");
  assert.throws(
    () => transitionJob(waiting, { role: "workshop", action: "advance" }),
    /unavailable/,
  );
  assert.throws(
    () => transitionJob(waiting, { role: "customer", action: "parts-arrived" }),
    /unavailable/,
  );
  const resumed = transitionJob(
    waiting,
    { role: "workshop", action: "parts-arrived" },
    now,
  );
  assert.equal(resumed.status, "repairing");
  assert.equal(quoteFor(resumed).version, 2);
  assert.equal(
    transitionJob(resumed, { role: "workshop", action: "advance" }, now).status,
    "quality",
  );
});
test("cancellation is terminal, records the reason, and retains all previous history", () => {
  const job = revise(sample());
  const cancelled = transitionJob(
    job,
    { role: "customer", action: "cancel", reasonId: "customer-request" },
    now,
  );
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.closedFrom, "approval");
  assert.equal(cancelled.history.length, job.history.length + 1);
  assert.equal(cancelled.quotes.length, 2);
  for (const action of ["advance", "approve", "revise", "cancel"])
    assert.throws(
      () => transitionJob(cancelled, { role: "workshop", action }),
      /closed/,
    );
});
for (const [name, makeJob, input] of [
  [
    "customer quote revision",
    sample,
    {
      role: "customer",
      action: "revise",
      partsId: "pads",
      labourId: "standard",
      reasonId: "inspection",
    },
  ],
  [
    "workshop approval",
    sample,
    { role: "workshop", action: "approve", quoteVersion: 1 },
  ],
  [
    "waiting without replacement parts",
    () => approve(sample()),
    { role: "workshop", action: "wait-parts" },
  ],
  [
    "customer cancellation after work starts",
    () => approve(sample()),
    { role: "customer", action: "cancel", reasonId: "customer-request" },
  ],
  [
    "unknown part",
    sample,
    {
      role: "workshop",
      action: "revise",
      partsId: "free-text",
      labourId: "standard",
      reasonId: "inspection",
    },
  ],
  [
    "unknown labour",
    sample,
    {
      role: "workshop",
      action: "revise",
      partsId: "pads",
      labourId: "forged",
      reasonId: "inspection",
    },
  ],
  [
    "unchanged quote",
    sample,
    {
      role: "workshop",
      action: "revise",
      partsId: "none",
      labourId: "standard",
      reasonId: "inspection",
    },
  ],
])
  test(`rejects ${name} without changing the saved object`, () => {
    const job = makeJob();
    const snapshot = JSON.stringify(job);
    assert.throws(() => transitionJob(job, input, now));
    assert.equal(JSON.stringify(job), snapshot);
  });
test("quote and journal growth have explicit sample limits", () => {
  let job = sample();
  for (let index = 0; index < 11; index++)
    job = revise(job, index % 2 ? "chain" : "pads");
  assert.equal(quoteFor(job).version, 12);
  assert.throws(() => revise(job, "tube"), /twelve estimate/);
  job = {
    ...sample(),
    history: Array.from({ length: 128 }, () => sample().history[0]),
  };
  assert.throws(() => approve(job), /history limit/);
});
test("old saved repairs remain readable and become versioned on their next decision", () => {
  const job = sample();
  assert.equal(job.quotes, undefined);
  assert.equal(quoteFor(job).version, 1);
  const approved = approve(job);
  assert.equal(approved.estimate, 80);
  assert.equal(approved.quotes.length, 1);
  assert.equal(approved.history.length, 4);
});
async function apiFixture() {
  const saved = new Map();
  const api = createApi(
    {
      getWorkspace: async (id) => structuredClone(saved.get(id)),
      setWorkspace: async (id, workspace) =>
        saved.set(id, structuredClone(workspace)),
      transaction: async (fn) => fn(),
    },
    { now: () => now },
  );
  const start = await api(
    new Request("https://demo.example/api/tracker", { method: "POST" }),
  );
  const cookie = start.headers.get("set-cookie").split(";")[0];
  const action = (input) =>
    api(
      new Request("https://demo.example/api/tracker/actions", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: "NL-2401", ...input }),
      }),
    );
  const read = () =>
    api(
      new Request("https://demo.example/api/tracker", {
        headers: { Cookie: cookie },
      }),
    );
  return { action, read };
}
test("API rejects forged prices and personal notes before any history change", async () => {
  const { action, read } = await apiFixture();
  for (const extra of [
    { total: 1 },
    { note: "a personal note" },
    { estimate: 1 },
  ]) {
    const response = await action({
      revision: 1,
      role: "workshop",
      action: "revise",
      partsId: "pads",
      labourId: "standard",
      reasonId: "inspection",
      ...extra,
    });
    assert.equal(response.status, 422);
  }
  const { workspace } = await (await read()).json();
  assert.equal(workspace.revision, 1);
  assert.equal(workspace.jobs[0].history.length, 3);
});
test("API persists versions and rejects an approval from a stale tab", async () => {
  const { action, read } = await apiFixture();
  const revision = await action({
    revision: 1,
    role: "workshop",
    action: "revise",
    partsId: "pads",
    labourId: "adjustment",
    reasonId: "inspection",
  });
  assert.equal(revision.status, 200);
  assert.equal(
    (
      await action({
        revision: 1,
        role: "customer",
        action: "approve",
        quoteVersion: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await action({
        revision: 2,
        role: "customer",
        action: "approve",
        quoteVersion: 1,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await action({
        revision: 2,
        role: "customer",
        action: "approve",
        quoteVersion: 2,
      })
    ).status,
    200,
  );
  const { workspace } = await (await read()).json();
  assert.equal(workspace.revision, 3);
  assert.equal(quoteFor(workspace.jobs[0]).decision, "approved");
  assert.equal(workspace.jobs[0].estimate, 125);
});
