# Work-order release

## Delivery plan

1. Preserve existing repairs and decisions while introducing stable customer and bike records. Do not merge people by name. Support returning bikes and repair history.
2. Configure service scopes and prices, actual part models/SKUs and stock, staff availability and shop opening days. Calculate currency in integer cents.
3. Prepare one versioned estimate with multiple services and compatible parts. Freeze descriptions, quantities and prices in each version; revisions require fresh approval.
4. Record intake condition and diagnosis, separate internal notes from customer updates, attach persistent photos, and issue revocable, expiring links that reveal only one repair.
5. Simplify the operator screens, explain stock shortages and scheduling conflicts, verify complete journeys across browsers, reassess the result, then publish the verified release.

## Acceptance

- A returning customer's bike retains its previous repairs without changing historical customer/bike snapshots.
- A multi-service estimate with fractional prices has an exact total. Configuration changes cannot rewrite an earlier quote or decision.
- Stock shortages pause approved work; receipt and reservation remain consistent across concurrent changes.
- Staff availability and shop closure prevent invalid scheduling. Job budgets remain optional internal estimates, independent of collection dates.
- A recipient without workshop access can inspect and approve only the current version of their repair. Internal notes and photos remain private. Revoked/expired links fail.
- Photos survive reload and deployment, accept only bounded PNG/JPEG files, and never expose arbitrary files or storage keys.
- Existing saved repairs survive migration, and keyboard, mobile and error recovery workflows remain usable.

## Boundaries

The hosted portfolio uses fictional data and expiring workspaces. The protected installation can retain real records. This release does not send customer messages, process charges, calculate taxes, or claim verified customer identity. Sharing a repair link is a manual operator action. Separate staff logins, accounting integrations and supplier purchasing remain outside this release.

## Reassessment and refinements

The second pass tightened the complete workflow rather than adding unrelated screens:

- Compatible part controls appear only when that part is selected. An optional itemized editor allows several inspected services under one approval while retaining the single-charge path for older jobs.
- Customer creation preselects that customer when adding their bike; returning intake reuses saved names and preserves earlier repair snapshots.
- Condition, updates, photos and customer links use disclosures that retain their open state during saves. The current estimate and next action stay visible.
- Stock waits list each required quantity, available stock and shortage, with a direct stock-management link.
- Availability changes flag existing scheduling conflicts instead of silently moving repairs.
- Internal notes are omitted from customer previews, scoped customer pages and printed rider summaries.
- Browser review corrected the customer selector's accessible name and inherited footer contrast. Firefox exposed a corrupt PNG fixture; validation now checks PNG chunk integrity and rejects damaged images.
- Switching between customer link fragments reloads the correct scoped repair. Uncertain or stale decisions require refresh, and rejected cloud writes remove their own newly uploaded photo.

Verification evidence and commercial boundaries remain in the QA report and operations guide. Future shop use would require operator validation of tax, deposits, refunds, supplier workflows, outbound communication and staff permissions; those integrations were not fabricated in this release.

Production reassessment also replaced raw JSON parsing errors from empty rate-limit or HTML gateway responses with actionable recovery guidance. Limits remain in force; saved records and uncertain-write locks are retained. No failed write is replayed automatically. A five-configuration browser journey covers workshop, tracker and separate customer-page recovery.
