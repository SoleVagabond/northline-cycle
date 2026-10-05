import { createHash, createHmac } from "node:crypto";
import { createWorkspace } from "./repairs.js";
import {
  operationsWorkspace,
  workshopAction,
  catalogue,
} from "./workshop-domain.js";
import { shopSettings } from "./shop-data.js";
export function staffWorkspace(id, now) {
  const workspace = createWorkspace(id, now);
  workspace.jobs = [];
  workspace.accessMode = "staff";
  workspace.expiresAt = "9999-12-31T23:59:59.000Z";
  return operationsWorkspace(workspace);
}
export function publicCatalogue(workspace, portfolio) {
  const shop = shopSettings(workspace);
  return {
    portfolio,
    shop: {
      name: shop.name,
      openingDays: shop.openingDays,
      opens: shop.opens,
      closes: shop.closes,
    },
    services: catalogue(workspace)
      .filter((item) => item.enabled)
      .map(({ id, name, unit, description, includes, price }) => ({
        id,
        name,
        unit,
        description,
        includes,
        price,
      })),
  };
}
export async function publicRequest(
  storage,
  input,
  { workspaceId, key, now, portfolio },
) {
  const invalid = (message) =>
    Object.assign(new Error(message), { status: 422 });
  const action = (workspace, input, options) => {
    try {
      return workshopAction(workspace, input, now, options);
    } catch (error) {
      throw Object.assign(error, { status: 422 });
    }
  };
  const allowed = [
    "requestId",
    "name",
    "email",
    "phone",
    "bike",
    "concern",
    "serviceId",
    "collection",
    "website",
  ];
  if (
    !input ||
    Object.keys(input).some((name) => !allowed.includes(name)) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      input.requestId || "",
    ) ||
    typeof input.collection !== "boolean" ||
    input.website
  )
    throw invalid("Check your repair request and try again.");
  for (const [name, limit] of [
    ["name", 80],
    ["bike", 80],
    ["concern", 400],
  ])
    if (
      typeof input[name] !== "string" ||
      !input[name].trim() ||
      input[name].length > limit ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[name])
    )
      throw invalid(
        "Complete your name, bike and concern within the shown limits.",
      );
  if (!portfolio && !(input.email || input.phone))
    throw invalid(
      "Provide an email address or phone number so the shop can contact you.",
    );
  const signature = createHash("sha256")
    .update(
      JSON.stringify(
        allowed
          .filter((name) => name !== "website")
          .map((name) => input[name] ?? ""),
      ),
    )
    .digest("hex");
  const token = createHmac("sha256", key)
    .update("northline-public-receipt-v1:" + input.requestId)
    .digest("hex");
  return storage.transaction(async () => {
    const original = await storage.getWorkspace(workspaceId);
    let workspace = original
      ? operationsWorkspace(original)
      : staffWorkspace(workspaceId, now);
    const existing = workspace.jobs.find(
      (job) => job.publicRequestId === input.requestId,
    );
    if (existing) {
      if (existing.publicRequestSignature !== signature)
        throw Object.assign(
          new Error(
            "These choices differ from the saved request. Start a new request.",
          ),
          { status: 409 },
        );
      if (
        !existing.customerAccess ||
        existing.customerAccess.reference !== existing.publicReceiptReference ||
        existing.customerAccess.hash !==
          createHash("sha256").update(token).digest("hex") ||
        Date.parse(existing.customerAccess.expiresAt) <= now.getTime()
      )
        throw Object.assign(
          new Error(
            "Your request is already saved. Ask the workshop for a fresh repair link.",
          ),
          { status: 409 },
        );
      const savedLink = await storage.getCustomerLink(
        existing.customerAccess.reference,
      );
      if (!savedLink)
        await storage.setCustomerLink(existing.customerAccess.reference, {
          workspaceId,
          jobId: existing.id,
          expiresAt: existing.customerAccess.expiresAt,
        });
      return {
        duplicate: true,
        repairId: existing.id,
        estimate: existing.estimate,
        portalFragment: `${existing.customerAccess.reference}.${token}`,
      };
    }
    // An anonymous request creates its own record; matching contact details never grant access to an existing bike.
    const customer = action(
      workspace,
      {
        action: "save-customer",
        name: input.name,
        email: input.email || "",
        phone: input.phone || "",
      },
      { allowPersonalData: !portfolio },
    );
    workspace = customer.workspace;
    const bike = action(
      workspace,
      {
        action: "save-bike",
        customerId: customer.customerId,
        name: input.bike,
        serial: "",
        notes: "",
      },
      { allowPersonalData: true },
    );
    workspace = bike.workspace;
    const repair = action(
      workspace,
      {
        action: "create",
        requestId: input.requestId,
        recordBikeId: bike.recordBikeId,
        bikeId: "city",
        issueId: "routine",
        serviceId: input.serviceId,
        collection: input.collection,
        rider: input.name,
        bike: input.bike,
        issue: input.concern,
      },
      { allowPersonalData: true },
    );
    workspace = repair.workspace;
    const link = action(
      workspace,
      { action: "create-link", jobId: repair.repairId },
      { allowPersonalData: true },
    );
    workspace = link.workspace;
    const job = workspace.jobs.find((item) => item.id === repair.repairId);
    job.customerAccess.hash = createHash("sha256").update(token).digest("hex");
    job.publicRequestId = input.requestId;
    job.publicRequestSignature = signature;
    job.publicReceiptReference = job.customerAccess.reference;
    workspace.revision++;
    workspace.updatedAt = now.toISOString();
    await storage.setWorkspace(workspace.id, workspace);
    await storage.setCustomerLink(job.customerAccess.reference, {
      workspaceId,
      jobId: job.id,
      expiresAt: job.customerAccess.expiresAt,
    });
    return {
      duplicate: false,
      repairId: job.id,
      estimate: job.estimate,
      portalFragment: `${job.customerAccess.reference}.${token}`,
    };
  });
}
