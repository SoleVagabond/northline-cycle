# Northline Cycle Co.

A responsive website and repair tracker for a fictional bicycle workshop. Personal portfolio demonstration of original visual design, front-end behavior, and a persisted business workflow.

![Repair tracker](docs/tracker-desktop.jpg)

**Live demo:** [Northline Cycle Co.](https://northline-cycle-devin.netlify.app) · [Project story](https://northline-cycle-devin.netlify.app/case-study.html)

## Explore the demo

1. Choose Everyday tune-up and collection to see the $80 estimate.
2. Choose a sample bike and concern, then create a sample repair.
3. Open its tracker, start inspection, and request customer approval in Workshop view.
4. Switch to Customer view and approve; return to Workshop view for the ride check and collection.
5. Reload to see the saved journal. Reset to explore a fresh demo.

The customer and workshop views demonstrate different workflow actions. They are accessible to every visitor and are **not account roles or authentication boundaries**. All names, repair histories, prices, and service promises are fictional.

## What it demonstrates

- Original bicycle and six service illustrations, responsive layouts, visible keyboard focus, and reduced-motion support.
- Service filters, card-to-form selection, collection estimates, and browser/server validation.
- Submitted requests plus three starting samples across seven stages, approval gating, a repair journal, and progress saved between visits.
- A separate workspace for each browser session; stale updates are rejected rather than silently overwriting progress.
- Confirmation only after an atomic workspace save; retry references prevent duplicate requests after a lost response.
- Local file storage and a Netlify Functions/Blobs adapter using conditional storage-version writes.

## Run locally

Node.js 22 or later:

```sh
npm start
```

Open **http://127.0.0.1:8788**. The plain local demo and its tests need no package installation. The form has a fixed fictional rider and controlled sample choices. It accepts no personal names, emails, or free-text notes. Local workspaces are stored under the ignored `data/tracker/` directory; no new enquiry log is written.

```sh
npm test
```

The 32 isolated tests cover sample-choice validation and persistence, approval gating, the full repair lifecycle, separate visitors, restart persistence, stale/concurrent updates, failed storage, private files, split-packet UTF-8, duplicate prevention, expiry, cleanup cursor behavior, capacity, and the cloud adapter's conditional-write contract.

## Hosting preparation

```sh
npm ci
npm run typecheck
npm run build
npx netlify-cli@27.10.2 dev
```

Stop the plain local server first, because Netlify Dev starts it on port 8788. Open **http://localhost:8888** to exercise the hosting function and local Blobs emulator. `public/` contains only 18 allowlisted public files; backend source and saved records are excluded.

`netlify/functions/api.mts` handles `/api/*`. The function uses its deployment context to select storage. Production uses a site-wide Blobs store; preview deployments use deploy-scoped storage. Reads request strong consistency. Updates use the ETag from the read with `onlyIfMatch`; an unsuccessful conditional write returns 409. New workspaces use `onlyIfNew`. Each request adds a repair inside the same conditional workspace write, avoiding partial saves across multiple records.

The SDK 11.1.3 local emulator omits GET ETags. In local development only, the adapter brackets a fresh read with matching list versions before using a conditional write. Hosted requests require the normal ETag. The emulator is not evidence of distributed concurrency guarantees; isolated adapter tests verify the conditional-write contract.

Published to the new `northline-cycle-devin` project. For future CLI deployments, sign in, link this existing project, then deploy the public build and functions.

## Verification

32 automated checks passed. Twelve smoke checks passed against the plain local server, the Netlify function with its Blobs emulator, and the HTTPS public site. Browser checks covered the request-to-collection journey, reload persistence, keyboard repair selection, failure recovery, and responsive rendering in one Chromium-based browser. See the [QA report](qa/QA-REPORT.md) and [test plan](qa/TEST-PLAN.md) for evidence and limits.

![Narrow tracker details](docs/tracker-mobile-detail.jpg)

## Public demo controls

Requests accept only approved bike, concern, service, time, collection, and request-reference fields. Personal fields are rejected. A workspace holds at most ten repairs, expires seven days after creation, and cannot be updated after expiry. Local cleanup runs on requests at most once an hour. A production scheduled function runs hourly, deletes expired workspaces in bounded batches, and saves a cursor to resume scanning. Deletion follows expiry as the cleanup job progresses; it is not an exact seven-day physical-deletion guarantee. Preview stores enforce expiry on access but do not run production schedules.

The hosted API has a 60-request/minute limit per IP and domain. Platform enforcement is delayed and is not a global spending cap. The published production manifest confirms this rule and the hourly cleanup schedule. Scheduled execution has not yet been observed.

The app's full dependency audit reported zero findings at release verification. The Netlify CLI is an external development/deployment tool rather than an app dependency. Version 27.10.2 has upstream advisories in `braces` and `node-forge` with no patched package release available at review time. Keep development previews local and use trusted project inputs. The isolated local tooling applied the available `sharp` 0.35.5 patch; this does not resolve the other advisories.

## Project story and checks

`case-study.html` explains the fictional brief, implementation, demonstrable outcomes, and limits. `project-brief.md` is a downloadable summary. The sharing image and favicon are original project assets. Build-time `SITE_URL` (or Netlify's deployment URL variables) turns the sharing-image URL into an absolute URL.

`npm run format:check` checks source formatting. The GitHub workflow runs formatting, regression tests, type checking, and the public build on pushes and pull requests.

## Scope

The form creates a sample repair; it does not send email, reserve a calendar slot, or take payment. This is a demonstration rather than a production workshop system. Real client use would require authenticated customer/staff accounts, business data storage and retention decisions, abuse controls, notifications, and operational review. No complete accessibility, security, load, or cross-browser audit is claimed.

## Structure

```text
index.html / styles.css    Page structure and visual design
app.js                    Service selection, estimates, and enquiry states
tracker.js                Customer/workshop views and repair actions
assets/                   Six original decorative service illustrations
lib/services.js           Catalogue and price calculation
lib/repairs.js            Sample jobs and valid stage transitions
lib/api.js                Shared request handling and validation
lib/file-store.js          Local storage and serialized updates
lib/blob-store.js          Hosting storage and conditional version writes
netlify/functions/        Hosting entry point
scripts/build.mjs         Public-file allowlist
test/                     Isolated regression checks
docs/                     Browser evidence
```

## Portfolio description

Responsive bicycle-workshop website with service estimates, saved sample requests, and an interactive repair tracker. Includes customer approval, seven repair stages, separate visitor workspaces, persistent history, and stale-update handling. Original illustrations and 32 automated regression checks. Personal demonstration for a fictional business.

## Source and QA evidence

[Live demo](https://northline-cycle-devin.netlify.app) · [Project story](https://northline-cycle-devin.netlify.app/case-study.html) · [QA report](qa/QA-REPORT.md)

The `qa/` folder contains the supporting case study, smoke checker, and local/hosted evidence for this one project. Run its checker from the repository root with `node qa/verify.mjs http://127.0.0.1:8788`, or with the owned live demo URL and `--hosted`.
