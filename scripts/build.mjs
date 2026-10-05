import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const publishRoot = path.resolve(root, "public");
if (path.dirname(publishRoot) !== path.resolve(root))
  throw new Error("Invalid publish directory");
await rm(publishRoot, { recursive: true, force: true });
const publicFiles = [
  "index.html",
  "customer-site.js",
  "customer-site.css",
  "case-study.html",
  "project-brief.md",
  "styles.css",
  "app.js",
  "tracker.js",
  "workshop.html",
  "workshop.css",
  "workshop.js",
  "records-ui.js",
  "customer.html",
  "customer.js",
  "lib/money.js",
  "lib/shop-data.js",
  "lib/workshop-query.js",
  "assets/favicon.svg",
  "assets/share.jpg",
  "docs/tracker-desktop.jpg",
  "docs/workshop-queue.png",
  "lib/services.js",
  "lib/repairs.js",
  "lib/quotes.js",
  "lib/decision-view.js",
  "lib/demo-session.js",
  ...["safety", "puncture", "tune", "overhaul", "drivetrain", "wheel"].map(
    (id) => `assets/${id}.svg`,
  ),
];
for (const file of publicFiles) {
  const destination = path.join(root, "public", file);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, file), destination);
}
for (const [source, target] of [
  ["demo.html", "demo/index.html"],
  ["workshop.html", "demo/workshop.html"],
]) {
  const destination = path.join(publishRoot, target);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(root, source), destination);
}
console.log(
  `Prepared ${publicFiles.length + 2} public files. Backend code and data are excluded.`,
);
const siteUrl =
  process.env.SITE_URL ||
  (process.env.CONTEXT === "production"
    ? process.env.URL
    : process.env.DEPLOY_PRIME_URL);
if (siteUrl) {
  const base = new URL(siteUrl).origin;
  for (const file of ["index.html", "case-study.html"]) {
    const destination = path.join(publishRoot, file);
    const html = (await readFile(destination, "utf8"))
      .replace(
        'content="/assets/share.jpg"',
        `content="${base}/assets/share.jpg"`,
      )
      .replace(
        "</head>",
        `<link rel="canonical" href="${base}/${file === "index.html" ? "" : file}"></head>`,
      );
    await writeFile(destination, html);
  }
}
