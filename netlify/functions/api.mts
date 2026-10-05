import type { Config, Context } from "@netlify/functions";
import { getStore, getDeployStore } from "@netlify/blobs";
import { createSiteApi } from "../../lib/site-api.js";
import { createBlobStore } from "../../lib/blob-store.js";

export default async function handler(
  request: Request,
  context: Context,
): Promise<Response> {
  const options = { name: "northline-demo", consistency: "strong" as const };
  const store =
    context.deploy.context === "production"
      ? getStore(options)
      : getDeployStore(options);
  const localEmulator =
    Netlify.env.get("NETLIFY_DEV") === "true" ||
    Netlify.env.get("CONTEXT") === "dev";
  const response = await createSiteApi(
    createBlobStore(store, { localEmulator }),
    {
      operatorKey: Netlify.env.get("NORTHLINE_OPERATOR_KEY"),
      workspaceId: Netlify.env.get("NORTHLINE_WORKSPACE_ID"),
      secure: true,
      portfolio: Netlify.env.get("NORTHLINE_PUBLIC_MODE") !== "live",
    },
  )(request, context.ip);
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config: Config = {
  path: "/api/*",
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
