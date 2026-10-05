import { createHash, timingSafeEqual } from "node:crypto";
import { quoteFor } from "./quotes.js";
import { repairAction, operationsWorkspace } from "./workshop-domain.js";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export async function portalRecord(request, workspaceFor, now) {
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer ([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!supplied || !uuid.test(supplied[1])) return null;
  const workspace = await workspaceFor(supplied[1]);
  if (!workspace) return null;
  const digest = createHash("sha256").update(supplied[2]).digest();
  const job = workspace.jobs.find(
    (item) =>
      item.customerAccess &&
      /^[a-f0-9]{64}$/.test(item.customerAccess.hash || "") &&
      Date.parse(item.customerAccess.expiresAt) > now.getTime() &&
      timingSafeEqual(Buffer.from(item.customerAccess.hash, "hex"), digest),
  );
  return job ? { workspace, job } : null;
}
export function customerSnapshot(workspace, job) {
  return {
    revision: workspace.revision,
    shopName: workspace.shopSettings?.name || "Northline Cycle Co.",
    job: {
      id: job.id,
      rider: job.rider,
      bike: job.bike,
      issue: job.issue,
      status: job.status,
      expectedReadyDate: job.expectedReadyDate || null,
      estimate: job.estimate,
      quote: quoteFor(job),
      quotes: job.quotes || [quoteFor(job)],
      updates: job.updates || [],
      photos: (job.photos || [])
        .filter((photo) => photo.customerVisible)
        .map(({ id, caption, at }) => ({ id, caption, at })),
      payment: job.payment || null,
    },
  };
}
export async function customerRoute(
  request,
  { workspaceFor, storage, now, readInput, json },
) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/customer/")) return null;
  if (path === "/api/customer/decision" && request.method === "POST") {
    const input = await readInput(request);
    if (
      Object.keys(input).some(
        (key) => !["revision", "quoteVersion", "action"].includes(key),
      ) ||
      !["approve", "decline"].includes(input.action)
    )
      return json(422, {
        error: "Choose approval or decline for the current estimate.",
      });
    return storage.transaction(async () => {
      const record = await portalRecord(request, workspaceFor, now());
      if (!record)
        return json(401, {
          error:
            "This repair link is unavailable or has expired. Ask the workshop for a new link.",
        });
      if (
        input.revision !== record.workspace.revision ||
        input.quoteVersion !== quoteFor(record.job).version
      )
        return json(409, {
          error:
            "The repair changed. Refresh and review the current estimate before deciding.",
        });
      let workspace;
      try {
        workspace = repairAction(
          record.workspace,
          {
            jobId: record.job.id,
            role: "customer",
            action: input.action,
            quoteVersion: input.quoteVersion,
          },
          now(),
        );
      } catch (error) {
        return json(422, { error: error.message });
      }
      workspace.revision++;
      workspace.updatedAt = now().toISOString();
      await storage.setWorkspace(workspace.id, workspace);
      return json(
        200,
        customerSnapshot(
          workspace,
          workspace.jobs.find((job) => job.id === record.job.id),
        ),
      );
    });
  }
  const record = await portalRecord(request, workspaceFor, now());
  if (!record)
    return json(401, {
      error:
        "This repair link is unavailable or has expired. Ask the workshop for a new link.",
    });
  if (path === "/api/customer/repair" && request.method === "GET")
    return json(200, customerSnapshot(record.workspace, record.job));
  const photoMatch = path.match(/^\/api\/customer\/photos\/([a-f0-9-]{36})$/);
  if (photoMatch && request.method === "GET") {
    const photo = record.job.photos?.find(
      (item) => item.id === photoMatch[1] && item.customerVisible,
    );
    if (!photo) return json(404, { error: "Photo unavailable." });
    const image = await storage.getPhoto(record.workspace.id, photo.id);
    if (!image) return json(404, { error: "Photo unavailable." });
    return new Response(Buffer.from(image.data, "base64"), {
      headers: {
        "Content-Type": image.type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }
  return json(404, { error: "This customer action is unavailable." });
}
