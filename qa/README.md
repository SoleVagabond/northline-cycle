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

Use `http://localhost:8888` for Netlify Dev. All 12 checks passed against both targets. The checker creates fictional workspaces, completes a submitted repair, verifies saved progress and retry behavior, rejects personal fields, and checks public/private assets. The app contains 32 isolated regression tests.

For a hosted demo you own:

```sh
node qa/verify.mjs https://YOUR-SITE.netlify.app --hosted
```

The explicit flag permits HTTPS Netlify demo URLs. Run only against your own demo: it creates sample records. Other targets are refused. The [published demo](https://northline-cycle-devin.netlify.app) passed all 12 checks; output is in `evidence/hosted-smoke-checks.txt`.

This is supporting evidence for the Northline website in this repository.

## Portfolio description

Website QA case study covering a connected request-to-collection workflow, saved progress, retry behavior, and recovery. Includes four observed defects with corrections, browser evidence, 32 passing isolated tests, and a reusable 12-check smoke checker. Personal demonstration for a fictional business.
