# Northline verification pack

The [QA report](QA-REPORT.md) records current and historical release evidence. The [acceptance plan](TEST-PLAN.md), [business review](BIKE-SHOP-REVIEW.md) and [competitor comparison](COMPETITOR-REVIEW.md) explain tested behavior and product limits.

Run the app locally, then:

```sh
node qa/verify.mjs http://127.0.0.1:8788
node qa/verify-work-orders.mjs http://127.0.0.1:8788
```

The first checker contains 24 integration checks. The second adds eight for customer/bike records, configurable SKUs, exact itemized prices, private/shared photos, recipient approval, stock consumption, collection and revoked links. Both create separate fictional workspaces. Add `--hosted` with the owned production URL to verify deployment.

The checked-in suite contains 103 isolated checks and 37 browser journeys across desktop Chromium, 375/320-pixel Chromium, Firefox and WebKit. It includes genuine saved responses that are subsequently lost, concurrent revisions, restart persistence, private installation, scoped recipient decisions, keyboard controls, responsive layouts and unsuppressed accessibility scans. Viewport emulation and automated scans do not replace physical-device or independent usability/security testing.

Customer/staff/demo boundaries and their browser acceptance cases are documented in [ACCESS-SEPARATION](../docs/ACCESS-SEPARATION.md). The same suite checks cloud-session persistence, forged cookies and repair references, public receipts, sign-out, and recovery after a committed request loses its link-index write.

To check all three audiences with a configured staff key, run `NORTHLINE_OPERATOR_KEY=your-key node qa/verify-separation.mjs http://127.0.0.1:8788` (set the variable in your shell without publishing it). For the owned production deployment, use `--hosted --key-file /path/to/private-access.txt`; the file uses a `Workshop key: value` line. This checker creates and closes one fictional repair, shares one explicit update, revokes its link and signs out. It never prints the key.
