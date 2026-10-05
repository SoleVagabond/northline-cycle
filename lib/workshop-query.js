import { partOptions } from "./quotes.js";
import { repairTypes, workshopDate } from "./services.js";
import {
  serviceCatalogue,
  partsCatalogue,
  staffCatalogue,
  shopSettings,
} from "./shop-data.js";
import { sumMoney } from "./money.js";
export const closed = (job) => ["collected", "cancelled"].includes(job.status);
export const plannedMinutes = (job) => job.benchMinutes ?? 0;
export function catalogue(workspace) {
  return serviceCatalogue(workspace);
}
export function queueJobs(
  workspace,
  { search = "", status = "all", priority = "all", sort = "due" } = {},
  today = workshopDate(),
) {
  const text = search.trim().toLowerCase();
  const names = new Map(
    catalogue(workspace).map((item) => [item.id, item.name]),
  );
  const jobs = workspace.jobs.filter((job) => {
    const statusMatch =
      status === "all" ||
      (status === "active"
        ? !closed(job)
        : status === "overdue"
          ? !closed(job) && job.dueDate && job.dueDate < today
          : job.status === status);
    return (
      statusMatch &&
      (priority === "all" || (job.priority || "routine") === priority) &&
      [
        job.id,
        job.bike,
        job.rider,
        names.get(job.serviceId),
        job.mechanic,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(text),
      )
    );
  });
  return jobs.sort((a, b) =>
    sort === "value"
      ? b.estimate - a.estimate
      : sort === "recent"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : Number(closed(a)) - Number(closed(b)) ||
          Number(b.priority === "high") - Number(a.priority === "high") ||
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
          a.id.localeCompare(b.id),
  );
}
export function workshopReport(workspace) {
  const active = workspace.jobs.filter((job) => !closed(job));
  const completed = workspace.jobs.filter((job) => job.status === "collected");
  return {
    active: active.length,
    awaitingApproval: active.filter((job) => job.status === "approval").length,
    waitingParts: active.filter((job) => job.status === "waiting_parts").length,
    ready: active.filter((job) => job.status === "ready").length,
    completed: completed.length,
    completedValue: sumMoney(completed.map((job) => job.estimate)),
    recordedPayments: sumMoney(
      workspace.jobs.map((job) => job.payment?.amount || 0),
    ),
    outstanding: sumMoney(
      workspace.jobs
        .filter(
          (job) => ["ready", "collected"].includes(job.status) && !job.payment,
        )
        .map((job) => job.estimate),
    ),
  };
}

export function stockSummary(workspace) {
  return partsCatalogue(workspace).map((part) => {
    const item = workspace.inventory.find((row) => row.id === part.id);
    const reserved = workspace.jobs.reduce(
      (sum, job) =>
        sum +
        (job.reservedParts || [])
          .filter((line) => line.id === part.id)
          .reduce((n, line) => n + line.quantity, 0),
      0,
    );
    return { ...part, ...item, reserved, available: item.onHand - reserved };
  });
}
export function scheduleConflicts(workspace) {
  const staff = staffCatalogue(workspace),
    shop = shopSettings(workspace);
  return workspace.jobs
    .filter((job) => !closed(job) && job.dueDate)
    .flatMap((job) => {
      const member = staff.find((item) => item.id === job.mechanicId);
      const day = new Date(job.dueDate + "T12:00:00Z").getUTCDay();
      const reasons = [];
      if (!shop.openingDays.includes(day)) reasons.push("Shop closed");
      if (
        !member?.enabled ||
        !member.workDays.includes(day) ||
        member.unavailableDates.includes(job.dueDate)
      )
        reasons.push("Mechanic unavailable");
      if (
        member &&
        workspace.jobs
          .filter(
            (other) =>
              !closed(other) &&
              other.dueDate === job.dueDate &&
              other.mechanicId === job.mechanicId,
          )
          .reduce((sum, other) => sum + plannedMinutes(other), 0) >
          member.capacity
      )
        reasons.push("Daily bench budget exceeded");
      return reasons.length
        ? [{ jobId: job.id, bike: job.bike, dueDate: job.dueDate, reasons }]
        : [];
    });
}
