import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { cleanupExpired } from "../../lib/cleanup.js";

export default async function cleanup(): Promise<Response> {
  const store = getStore({ name: "northline-demo", consistency: "strong" });
  const result = await cleanupExpired(store);
  console.log(
    `Sample cleanup checked ${result.checked} workspaces; removed ${result.deleted}.`,
  );
  return new Response(null, { status: 204 });
}
export const config: Config = { schedule: "@hourly" };
