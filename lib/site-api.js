import { createApi } from "./api.js";
import { createOperatorAccess } from "./operator-auth.js";
import {
  publicCatalogue,
  publicRequest,
  staffWorkspace,
} from "./public-intake.js";
import { operationsWorkspace } from "./workshop-domain.js";
export const defaultStaffWorkspaceId = "edbcb6c8-f337-43b6-af56-72c7e46427fb";
const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
async function remap(request, path, cookie) {
  const url = new URL(request.url);
  url.pathname = path;
  const headers = new Headers(request.headers);
  if (cookie) headers.set("cookie", cookie);
  return new Request(url, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer(),
  });
}
export function createSiteApi(
  storage,
  {
    operatorKey = "",
    workspaceId = defaultStaffWorkspaceId,
    now = () => new Date(),
    secure = false,
    legacyPrivatePaths = false,
    portfolio = true,
  } = {},
) {
  const demo = createApi(storage, { now });
  const staff = createApi(storage, {
    now,
    workspaceId,
    permanent: true,
    allowPersonalData: true,
    emptyWorkspace: !legacyPrivatePaths,
  });
  const access = operatorKey
    ? createOperatorAccess(operatorKey, {
        now: () => now().getTime(),
        secure,
        storage,
      })
    : null;
  return async (request, address = "local") => {
    try {
      const path = new URL(request.url).pathname;
      if (path.startsWith("/api/public/")) {
        if (path === "/api/public/services" && request.method === "GET") {
          const saved = await storage.getWorkspace(workspaceId);
          return json(
            200,
            publicCatalogue(
              saved
                ? operationsWorkspace(saved)
                : staffWorkspace(workspaceId, now()),
              portfolio,
            ),
          );
        }
        if (path === "/api/public/enquiries" && request.method === "POST") {
          if (!access)
            return json(503, {
              error:
                "The workshop is not accepting online requests yet. Please try later.",
            });
          if (
            request.headers.get("origin") &&
            request.headers.get("origin") !== new URL(request.url).origin
          )
            return json(403, { error: "Submit from this shop's own website." });
          if (
            !request.headers
              .get("content-type")
              ?.toLowerCase()
              .startsWith("application/json")
          )
            return json(415, { error: "Submit the repair request form." });
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength > 8192)
            return json(413, { error: "Shorten your repair request." });
          let input;
          try {
            input = JSON.parse(
              new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            );
          } catch {
            return json(400, {
              error: "The repair request could not be read.",
            });
          }
          if (!input || typeof input !== "object" || Array.isArray(input))
            return json(422, { error: "Complete the repair request form." });
          const receipt = await publicRequest(storage, input, {
            workspaceId,
            key: operatorKey,
            now: now(),
            portfolio,
          });
          return json(receipt.duplicate ? 200 : 201, receipt);
        }
        return json(404, { error: "Customer action unavailable." });
      }
      if (path.startsWith("/api/demo/"))
        return demo(await remap(request, path.replace("/api/demo/", "/api/")));
      if (path.startsWith("/api/customer/")) return demo(request);
      const isStaff =
        path.startsWith("/api/staff/") || (legacyPrivatePaths && access);
      if (isStaff) {
        const localPath = path.replace("/api/staff/", "/api/");
        if (!access)
          return localPath === "/api/access" && request.method === "GET"
            ? json(200, {
                mode: "private",
                authenticated: false,
                configured: false,
              })
            : json(503, {
                error:
                  "Staff sign-in is not configured. The dashboard stays locked.",
              });
        const mapped = await remap(request, localPath);
        const denied = await access(mapped.clone(), address);
        if (denied) return denied;
        const response = await staff(
          await remap(mapped, localPath, `northline_demo=${workspaceId}`),
        );
        // The staff master is selected by the server. Keep the visitor's demo cookie intact.
        const headers = new Headers(response.headers);
        headers.delete("set-cookie");
        return new Response(response.body, {
          status: response.status,
          headers,
        });
      }
      // Older sample clients remain in the demo realm; staff records are never returned by its API.
      return demo(request);
    } catch (error) {
      return json(error.status || 503, {
        error: error.status
          ? error.message
          : "The workshop could not confirm this request. Try again shortly with the same choices.",
      });
    }
  };
}
