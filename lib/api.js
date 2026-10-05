import { randomUUID } from "node:crypto";
import { services, calculateEstimate } from "./services.js";
import {
  operationsWorkspace,
  catalogue,
  stockSummary,
  repairAction,
  workshopAction,
} from "./workshop-domain.js";
import {
  createWorkspace,
  transitionJob,
  createSampleRepair,
  demoBikes,
  demoIssues,
  maxRepairs,
  retentionDays,
} from "./repairs.js";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
function cookieId(request) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("northline_demo="))
    ?.slice(15);
  return value && uuid.test(value) ? value : null;
}
function sessionCookie(id, request) {
  return `northline_demo=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function readInput(request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw Object.assign(new Error("Please submit a JSON request."), {
      status: 415,
    });
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > 8192)
    throw Object.assign(
      new Error("Your request is too long. Please shorten the message."),
      { status: 413 },
    );
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw Object.assign(new Error("The request could not be read."), {
      status: 400,
    });
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Object.assign(new Error("Please check your request details."), {
      status: 422,
    });
  return data;
}
export function createApi(
  storage,
  {
    now = () => new Date(),
    workspaceId,
    permanent = false,
    allowPersonalData = false,
  } = {},
) {
  const freshWorkspace = () => {
    const workspace = createWorkspace(workspaceId || randomUUID(), now());
    if (permanent) workspace.expiresAt = "9999-12-31T23:59:59.000Z";
    return workspace;
  };
  async function workspaceFor(id) {
    const workspace = id ? await storage.getWorkspace(id) : null;
    if (!workspace) return null;
    const expiration =
      workspace.expiresAt ||
      new Date(
        new Date(workspace.createdAt).getTime() + retentionDays * 86400000,
      ).toISOString();
    return new Date(expiration).getTime() <= now().getTime() ? null : workspace;
  }
  return async (request) => {
    try {
      const path = new URL(request.url).pathname;
      const method = request.method;
      if (path === "/api/access" && method === "GET")
        return json(200, { mode: "portfolio", authenticated: true });
      if (!["GET", "HEAD"].includes(method)) {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin)
          return json(403, {
            error: "This request must come from the demo website.",
          });
      }
      if (path === "/api/services" && method === "GET") {
        const current = await workspaceFor(cookieId(request));
        const menu = current
          ? catalogue(operationsWorkspace(current))
          : services;
        return json(200, {
          services: services.flatMap((item) => {
            const selected = menu.find((entry) => entry.id === item.id);
            return selected?.enabled === false
              ? []
              : [{ ...item, price: selected?.price ?? item.price }];
          }),
        });
      }
      await storage.cleanupExpired?.();
      if (path === "/api/workshop" && method === "GET") {
        const current = await workspaceFor(cookieId(request));
        if (!current)
          return json(401, { error: "Open your workshop workspace first." });
        const workspace = operationsWorkspace(current);
        return json(200, {
          workspace,
          catalogue: catalogue(workspace),
          stock: stockSummary(workspace),
        });
      }
      if (path === "/api/workshop/actions" && method === "POST") {
        const input = await readInput(request);
        const id = cookieId(request);
        if (!id)
          return json(401, {
            error:
              "Your workshop session is unavailable. Reload your workspace.",
          });
        return await storage.transaction(async () => {
          const original = await workspaceFor(id);
          if (!original)
            return json(404, {
              error: "This workspace has expired or was reset.",
            });
          if (
            !Number.isInteger(input.revision) ||
            input.revision !== original.revision
          )
            return json(409, {
              error:
                "The workshop changed in another view. Reload before saving.",
            });
          let result;
          try {
            result = workshopAction(original, input, now(), {
              allowPersonalData,
            });
          } catch (error) {
            return json(422, { error: error.message });
          }
          if (!result.duplicate) {
            result.workspace.revision++;
            result.workspace.updatedAt = now().toISOString();
            await storage.setWorkspace(id, result.workspace);
          }
          return json(200, {
            ...result,
            catalogue: catalogue(result.workspace),
            stock: stockSummary(result.workspace),
          });
        });
      }
      if (path === "/api/enquiries" && method === "POST") {
        const input = await readInput(request);
        const allowed = [
          "requestId",
          "serviceId",
          "collection",
          "slot",
          "bikeId",
          "issueId",
          "estimate",
        ];
        if (
          Object.keys(input).some((key) => !allowed.includes(key)) ||
          !uuid.test(input.requestId || "") ||
          !["morning", "afternoon", "flexible"].includes(input.slot) ||
          !services.some((item) => item.id === input.serviceId) ||
          !demoBikes.some((item) => item.id === input.bikeId) ||
          !demoIssues.some((item) => item.id === input.issueId) ||
          typeof input.collection !== "boolean"
        )
          return json(422, {
            error:
              "Choose the sample bike, concern, service, and time. This demo accepts no personal details.",
          });
        return await storage.transaction(async () => {
          const existing = await workspaceFor(cookieId(request));
          const workspace = existing || freshWorkspace();
          const previous = workspace.jobs.find(
            (job) => job.requestId === input.requestId,
          );
          if (previous) {
            if (
              previous.serviceId !== input.serviceId ||
              previous.collection !== input.collection ||
              previous.preferredTime !== input.slot ||
              previous.bike !==
                demoBikes.find((item) => item.id === input.bikeId).label ||
              previous.issue !==
                demoIssues.find((item) => item.id === input.issueId).label
            )
              return json(409, {
                error:
                  "These choices differ from the saved request. Start a new sample request.",
              });
            return json(200, {
              id: previous.enquiryId,
              repairId: previous.id,
              estimate: previous.estimate,
              workspace,
              message: "This sample repair was already saved.",
            });
          }
          if (workspace.jobs.length >= maxRepairs)
            return json(422, {
              error:
                "Your demo has reached ten repairs. Reset the sample repairs to start fresh.",
            });
          const repair = createSampleRepair(input, randomUUID(), now());
          const service = catalogue(workspace).find(
            (item) => item.id === input.serviceId && item.enabled,
          );
          if (!service)
            return json(422, {
              error: "This service is inactive. Choose another repair type.",
            });
          repair.basePrice = service.price;
          repair.estimate = service.price + (input.collection ? 15 : 0);
          workspace.jobs.unshift(repair);
          workspace.revision++;
          workspace.updatedAt = now().toISOString();
          await storage.setWorkspace(workspace.id, workspace);
          return json(
            201,
            {
              id: repair.enquiryId,
              repairId: repair.id,
              estimate: repair.estimate,
              workspace,
              message: "Your sample request is saved and ready to track.",
            },
            existing
              ? {}
              : { "Set-Cookie": sessionCookie(workspace.id, request) },
          );
        });
      }
      if (path === "/api/tracker" && ["GET", "POST"].includes(method)) {
        const id = cookieId(request);
        const workspace = await workspaceFor(id);
        if (workspace) return json(200, { workspace });
        if (method === "GET")
          return json(404, { error: "Start your demo workspace first." });
        const created = freshWorkspace();
        await storage.setWorkspace(created.id, created);
        return json(
          201,
          { workspace: created },
          { "Set-Cookie": sessionCookie(created.id, request) },
        );
      }
      if (path === "/api/tracker/reset" && method === "POST") {
        const created = freshWorkspace();
        await storage.setWorkspace(created.id, created);
        return json(
          201,
          { workspace: created },
          { "Set-Cookie": sessionCookie(created.id, request) },
        );
      }
      if (path === "/api/tracker/actions" && method === "POST") {
        const input = await readInput(request);
        if (
          Object.keys(input).some(
            (key) =>
              ![
                "jobId",
                "revision",
                "role",
                "action",
                "quoteVersion",
                "enforceChecklist",
                "partsId",
                "partLines",
                "labourId",
                "reasonId",
              ].includes(key),
          )
        )
          return json(422, {
            error:
              "Use only the sample repair actions and choices. Prices are calculated by the server.",
          });
        const id = cookieId(request);
        if (!id)
          return json(401, {
            error: "Your demo session is unavailable. Start a new demo.",
          });
        return await storage.transaction(async () => {
          const workspace = await workspaceFor(id);
          if (!workspace)
            return json(404, { error: "This demo workspace was not found." });
          if (
            !Number.isInteger(input.revision) ||
            input.revision !== workspace.revision
          )
            return json(409, { error: "This repair changed in another view." });
          const index = workspace.jobs.findIndex(
            (job) => job.id === input.jobId,
          );
          if (index < 0)
            return json(404, { error: "Repair not found in your demo." });
          try {
            const result = repairAction(workspace, input, now());
            Object.assign(workspace, result);
          } catch (error) {
            return json(422, { error: error.message });
          }
          workspace.revision++;
          workspace.updatedAt = now().toISOString();
          await storage.setWorkspace(id, workspace);
          return json(200, { workspace });
        });
      }
      return json(["GET", "HEAD"].includes(method) ? 404 : 405, {
        error: "This action is not available.",
      });
    } catch (error) {
      return json(error.status || 503, {
        error: error.status ? error.message : "We could not save your request.",
      });
    }
  };
}
