import { repairTypes, mechanics } from "./services.js";
import { partOptions } from "./quotes.js";
export const serviceCatalogue = (workspace) =>
  [...repairTypes, ...(workspace.customServices || [])].map((item) => ({
    ...item,
    ...workspace.servicePrices?.[item.id],
    enabled:
      workspace.servicePrices?.[item.id]?.enabled ?? item.enabled ?? true,
  }));
export const partsCatalogue = (workspace) =>
  [
    ...partOptions.filter((item) => item.price),
    ...(workspace.customParts || []),
  ].map((item) => ({
    ...item,
    ...workspace.partSettings?.[item.id],
    enabled: workspace.partSettings?.[item.id]?.enabled ?? item.enabled ?? true,
  }));
export const staffCatalogue = (workspace) =>
  [...mechanics, ...(workspace.customStaff || [])].map((item) => ({
    ...item,
    enabled: true,
    workDays: [0, 1, 2, 3, 4, 5, 6],
    unavailableDates: [],
    ...workspace.staffSettings?.[item.id],
  }));
export const shopSettings = (workspace) => ({
  name: "Northline Cycle Co.",
  openingDays: [0, 1, 2, 3, 4, 5, 6],
  opens: "09:00",
  closes: "17:00",
  ...workspace.shopSettings,
});
export function initializeRecords(workspace) {
  workspace.customers ||= [];
  workspace.bikes ||= [];
  for (const job of workspace.jobs) {
    job.serviceSnapshot ||= structuredClone(
      serviceCatalogue(workspace).find((item) => item.id === job.serviceId),
    );
    if (!job.customerId) {
      job.customerId = "import-c-" + job.id;
      if (!workspace.customers.some((item) => item.id === job.customerId))
        workspace.customers.push({
          id: job.customerId,
          name: job.rider,
          email: "",
          phone: "",
          imported: true,
        });
    }
    if (!job.recordBikeId) {
      job.recordBikeId = "import-b-" + job.id;
      if (!workspace.bikes.some((item) => item.id === job.recordBikeId))
        workspace.bikes.push({
          id: job.recordBikeId,
          customerId: job.customerId,
          name: job.bike,
          serial: "",
          notes: "",
          imported: true,
        });
    }
    job.photos ||= [];
    job.updates ||= [];
  }
  workspace.schemaVersion = 5;
  return workspace;
}
