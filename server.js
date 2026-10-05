import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApi } from "./lib/api.js";
import { createFileStore } from "./lib/file-store.js";
import { createOperatorAccess } from "./lib/operator-auth.js";
import { photoRequestLimit } from "./lib/photos.js";
const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/case-study.html", ["case-study.html", "text/html; charset=utf-8"]],
  ["/project-brief.md", ["project-brief.md", "text/markdown; charset=utf-8"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/assets/share.jpg", ["assets/share.jpg", "image/jpeg"]],
  ["/docs/tracker-desktop.jpg", ["docs/tracker-desktop.jpg", "image/jpeg"]],
  ["/docs/workshop-queue.png", ["docs/workshop-queue.png", "image/png"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/tracker.js", ["tracker.js", "text/javascript; charset=utf-8"]],
  ["/workshop.html", ["workshop.html", "text/html; charset=utf-8"]],
  ["/workshop.css", ["workshop.css", "text/css; charset=utf-8"]],
  ["/workshop.js", ["workshop.js", "text/javascript; charset=utf-8"]],
  ["/records-ui.js", ["records-ui.js", "text/javascript; charset=utf-8"]],
  ["/customer.html", ["customer.html", "text/html; charset=utf-8"]],
  ["/customer.js", ["customer.js", "text/javascript; charset=utf-8"]],
  ["/lib/money.js", ["lib/money.js", "text/javascript; charset=utf-8"]],
  ["/lib/shop-data.js", ["lib/shop-data.js", "text/javascript; charset=utf-8"]],
  [
    "/lib/workshop-query.js",
    ["lib/workshop-query.js", "text/javascript; charset=utf-8"],
  ],
  ["/lib/services.js", ["lib/services.js", "text/javascript; charset=utf-8"]],
  ["/lib/repairs.js", ["lib/repairs.js", "text/javascript; charset=utf-8"]],
  ["/lib/quotes.js", ["lib/quotes.js", "text/javascript; charset=utf-8"]],
  [
    "/lib/decision-view.js",
    ["lib/decision-view.js", "text/javascript; charset=utf-8"],
  ],
  [
    "/lib/demo-session.js",
    ["lib/demo-session.js", "text/javascript; charset=utf-8"],
  ],
]);
for (const name of [
  "safety",
  "puncture",
  "tune",
  "overhaul",
  "drivetrain",
  "wheel",
])
  files.set("/assets/" + name + ".svg", [
    "assets/" + name + ".svg",
    "image/svg+xml",
  ]);
export function createApp({
  dataFile = join(root, "data", "enquiries.ndjson"),
  operatorKey = process.env.NORTHLINE_OPERATOR_KEY,
  publicOrigin = process.env.NORTHLINE_ORIGIN,
  privateWorkspaceId = process.env.NORTHLINE_WORKSPACE_ID ||
    "e12fb49a-1274-44f5-a2b0-63c9bffbd920",
} = {}) {
  if (
    publicOrigin &&
    (new URL(publicOrigin).protocol !== "https:" ||
      new URL(publicOrigin).origin !== publicOrigin)
  )
    throw new Error(
      "NORTHLINE_ORIGIN must be the exact HTTPS origin of this workshop, without a trailing slash.",
    );
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      privateWorkspaceId,
    )
  )
    throw new Error("NORTHLINE_WORKSPACE_ID must be a valid workspace UUID.");
  const access = operatorKey
    ? createOperatorAccess(operatorKey, {
        secure: process.env.NORTHLINE_COOKIE_SECURE === "true",
      })
    : null;
  const api = createApi(createFileStore(dataFile), {
    workspaceId: access ? privateWorkspaceId : undefined,
    permanent: !!access,
    allowPersonalData: !!access,
  });
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(
        req.url,
        publicOrigin || `http://${req.headers.host || "localhost"}`,
      );
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        let bytes = 0;
        const bodyLimit =
          url.pathname === "/api/photos" ? photoRequestLimit : 8192;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes <= bodyLimit + 1) chunks.push(chunk);
        }
        if (bytes > bodyLimit) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Your request is too long. Please shorten the message.",
            }),
          );
          return;
        }
        const body = ["GET", "HEAD"].includes(req.method)
          ? undefined
          : Buffer.concat(chunks);
        const headers = new Headers(req.headers);
        const request = new Request(url, { method: req.method, headers, body });
        const customerRequest = url.pathname.startsWith("/api/customer/");
        const accessResponse =
          access && !customerRequest
            ? await access(request.clone(), req.socket.remoteAddress)
            : null;
        if (access && !accessResponse && !customerRequest)
          headers.set("cookie", `northline_demo=${privateWorkspaceId}`);
        const response =
          accessResponse ||
          (await api(new Request(url, { method: req.method, headers, body })));
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      const file = files.get(url.pathname);
      if (!["GET", "HEAD"].includes(req.method) || !file) {
        res.writeHead(["GET", "HEAD"].includes(req.method) ? 404 : 405, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ error: "Page not found." }));
        return;
      }
      const content = await readFile(join(root, file[0]));
      res.writeHead(200, {
        "Content-Type": file[1],
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "We could not save your request." }));
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT || 8788);
  const host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () =>
    console.log(`Northline preview: http://${host}:${port}`),
  );
}
