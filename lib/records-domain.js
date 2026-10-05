import { randomUUID, randomBytes, createHash } from "node:crypto";
import {
  serviceCatalogue,
  partsCatalogue,
  staffCatalogue,
  shopSettings,
} from "./shop-data.js";
import { cents } from "./money.js";
export const recordSchemas = {
  "save-customer": ["customerId", "name", "email", "phone"],
  "save-bike": ["recordBikeId", "customerId", "name", "serial", "notes"],
  "save-service": [
    "serviceId",
    "name",
    "unit",
    "description",
    "includes",
    "price",
    "enabled",
  ],
  "save-part": [
    "partId",
    "name",
    "sku",
    "specification",
    "price",
    "reorderAt",
    "enabled",
  ],
  "save-staff": [
    "mechanicId",
    "name",
    "specialty",
    "capacity",
    "workDays",
    "unavailableDates",
    "enabled",
  ],
  "save-shop": ["name", "openingDays", "opens", "closes"],
  "inspection-record": ["jobId", "condition", "diagnosis"],
  "customer-update": ["jobId", "note"],
  "create-link": ["jobId"],
  "revoke-link": ["jobId"],
};
export function textField(value, label, max = 100, required = true) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(
      `Check ${label}: ${required ? "required, " : ""}up to ${max} characters.`,
    );
  return value.trim();
}
function days(value) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 7 ||
    new Set(value).size !== value.length ||
    value.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new Error("Choose at least one distinct working day.");
  return value;
}
function enabled(value) {
  if (typeof value !== "boolean") throw new Error("Choose an active setting.");
  return value;
}
function amount(value, max = 5000) {
  cents(value);
  if (value > max) throw new Error(`Price must be no more than $${max}.`);
  return value;
}
function put(list, record, max) {
  const index = list.findIndex((item) => item.id === record.id);
  if (index < 0) {
    if (list.length >= max)
      throw new Error("This workspace has reached its record limit.");
    list.push(record);
  } else list[index] = record;
}
export function recordsAction(
  workspace,
  input,
  now,
  { allowPersonalData = false } = {},
) {
  const job = workspace.jobs.find((item) => item.id === input.jobId);
  switch (input.action) {
    case "save-customer": {
      const existing = workspace.customers.find(
        (item) => item.id === input.customerId,
      );
      if (input.customerId && !existing)
        throw new Error("Choose an existing customer.");
      const name = textField(input.name, "customer name", 80);
      const email = textField(input.email ?? "", "email", 120, false);
      const phone = textField(input.phone ?? "", "phone", 40, false);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("Enter a valid email address or leave it blank.");
      if (!allowPersonalData && (phone || (email && !/\.test$/i.test(email))))
        throw new Error(
          "Use fictional names and .test email addresses in this portfolio. Real contact details belong in a protected installation.",
        );
      const record = {
        id: existing?.id || "customer-" + randomUUID(),
        name,
        email,
        phone,
      };
      put(workspace.customers, record, 500);
      return { workspace, customerId: record.id };
    }
    case "save-bike": {
      const existing = workspace.bikes.find(
        (item) => item.id === input.recordBikeId,
      );
      if (input.recordBikeId && !existing)
        throw new Error("Choose an existing bike.");
      if (!workspace.customers.some((item) => item.id === input.customerId))
        throw new Error("Choose the bike's customer.");
      if (existing && existing.customerId !== input.customerId)
        throw new Error(
          "A bike's owner cannot be changed through this form. Create a separate record for a transferred bike.",
        );
      const record = {
        id: existing?.id || "bike-" + randomUUID(),
        customerId: input.customerId,
        name: textField(input.name, "bike/model", 80),
        serial: textField(input.serial ?? "", "serial", 80, false),
        notes: textField(input.notes ?? "", "bike notes", 400, false),
      };
      put(workspace.bikes, record, 1000);
      return { workspace, recordBikeId: record.id };
    }
    case "save-service": {
      const existing = serviceCatalogue(workspace).find(
        (item) => item.id === input.serviceId,
      );
      if (input.serviceId && !existing)
        throw new Error("Choose an existing service.");
      if (
        !Array.isArray(input.includes) ||
        !input.includes.length ||
        input.includes.length > 8
      )
        throw new Error("Describe one to eight included tasks.");
      const record = {
        id: existing?.id || "service-" + randomUUID(),
        name: textField(input.name, "service name", 80),
        unit: textField(input.unit, "service unit", 100),
        description: textField(input.description, "service scope", 400),
        includes: input.includes.map((line) =>
          textField(line, "included task", 120),
        ),
        price: amount(input.price),
        enabled: enabled(input.enabled),
        category: existing?.category || "workshop",
      };
      if (
        !record.enabled &&
        !serviceCatalogue(workspace).some(
          (item) => item.id !== record.id && item.enabled,
        )
      )
        throw new Error("Keep at least one repair type active.");
      if (existing) workspace.servicePrices[record.id] = record;
      else {
        workspace.customServices ||= [];
        put(workspace.customServices, record, 48);
      }
      break;
    }
    case "save-part": {
      const existing = partsCatalogue(workspace).find(
        (item) => item.id === input.partId,
      );
      if (input.partId && !existing)
        throw new Error("Choose an existing part.");
      if (
        !Number.isInteger(input.reorderAt) ||
        input.reorderAt < 0 ||
        input.reorderAt > 100
      )
        throw new Error("Choose a reorder level from zero to one hundred.");
      const record = {
        id: existing?.id || "part-" + randomUUID(),
        name: textField(input.name, "part name", 80),
        sku: textField(input.sku, "SKU", 80),
        specification: textField(
          input.specification,
          "compatible model/size",
          100,
        ),
        price: amount(input.price),
        enabled: enabled(input.enabled),
      };
      if (
        partsCatalogue(workspace).some(
          (item) =>
            item.id !== record.id &&
            item.sku?.toLowerCase() === record.sku.toLowerCase(),
        )
      )
        throw new Error("That SKU already exists. Update the existing part.");
      workspace.partSettings ||= {};
      workspace.partSettings[record.id] = record;
      if (!existing) {
        workspace.customParts ||= [];
        put(workspace.customParts, record, 94);
        workspace.inventory.push({
          id: record.id,
          onHand: 0,
          reorderAt: input.reorderAt,
        });
      } else
        workspace.inventory.find((item) => item.id === record.id).reorderAt =
          input.reorderAt;
      break;
    }
    case "save-staff": {
      const existing = staffCatalogue(workspace).find(
        (item) => item.id === input.mechanicId,
      );
      if (input.mechanicId && !existing)
        throw new Error("Choose an existing mechanic.");
      if (
        !Number.isInteger(input.capacity) ||
        input.capacity < 1 ||
        input.capacity > 480
      )
        throw new Error("Enter a daily bench budget from one to 480 minutes.");
      const unavailable = input.unavailableDates;
      if (
        !Array.isArray(unavailable) ||
        unavailable.length > 90 ||
        unavailable.some(
          (date) =>
            typeof date !== "string" ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(date)) ||
            new Date(date).toISOString().slice(0, 10) !== date,
        )
      )
        throw new Error("Use valid dates for time off.");
      const record = {
        id: existing?.id || "staff-" + randomUUID(),
        name: textField(input.name, "mechanic name", 80),
        specialty: textField(input.specialty, "specialty", 100),
        capacity: input.capacity,
        workDays: days(input.workDays),
        unavailableDates: [...new Set(unavailable)],
        enabled: enabled(input.enabled),
      };
      if (
        !record.enabled &&
        !staffCatalogue(workspace).some(
          (item) => item.id !== record.id && item.enabled,
        )
      )
        throw new Error("Keep at least one mechanic active.");
      workspace.staffSettings ||= {};
      workspace.staffSettings[record.id] = record;
      if (!existing) {
        workspace.customStaff ||= [];
        put(workspace.customStaff, record, 9);
      }
      break;
    }
    case "save-shop": {
      if (
        ![input.opens, input.closes].every(
          (time) =>
            typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
        ) ||
        input.closes <= input.opens
      )
        throw new Error("Choose opening hours with closing after opening.");
      workspace.shopSettings = {
        name: textField(input.name, "shop name", 80),
        openingDays: days(input.openingDays),
        opens: input.opens,
        closes: input.closes,
      };
      break;
    }
    case "inspection-record":
      job.condition = textField(
        input.condition,
        "intake condition",
        600,
        false,
      );
      job.diagnosis = textField(input.diagnosis, "diagnosis", 600, false);
      break;
    case "customer-update":
      if (job.updates.length >= 100)
        throw new Error("This repair has reached its customer-update limit.");
      job.updates.push({
        id: randomUUID(),
        note: textField(input.note, "customer update", 600),
        at: now.toISOString(),
      });
      break;
    case "create-link": {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(
        Math.min(
          now.getTime() + 14 * 86400000,
          Date.parse(workspace.expiresAt),
        ),
      ).toISOString();
      job.customerAccess = {
        hash: createHash("sha256").update(token).digest("hex"),
        expiresAt,
      };
      return {
        workspace,
        portalFragment: `${workspace.id}.${token}`,
        portalExpiresAt: expiresAt,
      };
    }
    case "revoke-link":
      delete job.customerAccess;
      break;
    default:
      throw new Error("Unknown record action.");
  }
  if (job) job.updatedAt = now.toISOString();
  return { workspace };
}
