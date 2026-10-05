# Website QA Case Study

A verification pack supporting **Northline Cycle Co.**, a fictional bicycle-workshop website and saved repair workflow. Personal sample focused on reproducible checks, recovery, and regression coverage.

- [Test plan](TEST-PLAN.md): current scope, cases, and limits.
- [QA report](QA-REPORT.md): results, four observed defects, and evidence.
- [Smoke checker](verify.mjs): repeatable end-to-end checks.
- Screenshots and check output in `evidence/`.

## Run the checks

Start Northline from the repository root, then run:

```sh
node qa/verify.mjs http://127.0.0.1:8788
```

Use `http://localhost:8888` for Netlify Dev. The previous 12-check suite passed against both targets; the expanded 17-check suite passed against the plain local server. The checker creates fictional workspaces, completes a submitted repair, verifies revised estimates and exception paths, saved progress and retry behavior, rejects personal fields, and checks public/private assets. The app contains 48 isolated regression tests and 57 Chromium browser scenarios.

For a hosted demo you own:

```sh
node qa/verify.mjs https://YOUR-SITE.netlify.app --hosted
```

The explicit flag permits HTTPS Netlify demo URLs. Run only against your own demo: it creates sample records. Other targets are refused. The [published demo](https://northline-cycle-devin.netlify.app) passed all 17 checks; output is in `evidence/hosted-smoke-checks.txt`.

This is supporting evidence for the Northline website in this repository.

## Portfolio description

Website QA case study covering a connected request-to-collection workflow, versioned estimates, customer decisions, saved progress, retry behavior, and recovery. Includes four observed defects with corrections, browser evidence, 48 passing isolated tests, 57 browser scenarios, and a reusable 17-check smoke checker. Personal demonstration for a fictional business.
