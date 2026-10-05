# Northline verification pack

The [QA report](QA-REPORT.md) records current and historical release evidence. The [acceptance plan](TEST-PLAN.md), [business review](BIKE-SHOP-REVIEW.md) and [competitor comparison](COMPETITOR-REVIEW.md) explain tested behavior and product limits.

Run the unprotected app locally, then:

```sh
node qa/verify.mjs http://127.0.0.1:8788
node qa/verify-work-orders.mjs http://127.0.0.1:8788
```

The first checker contains 24 integration checks. The second adds eight for customer/bike records, configurable SKUs, exact itemized prices, private/shared photos, recipient approval, stock consumption, collection and revoked links. Both create separate fictional workspaces. Add `--hosted` with the owned production URL to verify deployment.

The checked-in suite contains 94 isolated checks and 34 browser journeys across desktop Chromium, 375/320-pixel Chromium, Firefox and WebKit. It includes genuine saved responses that are subsequently lost, concurrent revisions, restart persistence, private installation, scoped recipient decisions, keyboard controls, responsive layouts and unsuppressed accessibility scans. Viewport emulation and automated scans do not replace physical-device or independent usability/security testing.
