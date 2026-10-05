import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApi } from "./lib/api.js";
import { createFileStore } from "./lib/file-store.js";
const root = dirname(fileURLToPath(import.meta.url));
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/case-study.html", ["case-study.html", "text/html; charset=utf-8"]],
  ["/project-brief.md", ["project-brief.md", "text/markdown; charset=utf-8"]],
  ["/assets/favicon.svg", ["assets/favicon.svg", "image/svg+xml"]],
  ["/assets/share.jpg", ["assets/share.jpg", "image/jpeg"]],
  ["/docs/tracker-desktop.jpg", ["docs/tracker-desktop.jpg", "image/jpeg"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/tracker.js", ["tracker.js", "text/javascript; charset=utf-8"]],
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
} = {}) {
  const api = createApi(createFileStore(dataFile));
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (url.pathname.startsWith("/api/")) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes <= 8193) chunks.push(chunk);
        }
        if (bytes > 8192) {
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
        const response = await api(
          new Request(url, { method: req.method, headers: req.headers, body }),
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
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
