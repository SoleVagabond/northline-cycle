# Northline Cycle Co. — test plan

## Scope and environment

A fictional workshop website and eight-screen repair-management application: priced intake, estimates, queue, scheduling, stock, quality checks, offline payment records, reports, protected local mode, persistence and recovery.

Windows, Node.js 22.14.0, desktop Chromium/Firefox/WebKit and Chromium at 375/320 pixels; GitHub repeats the suite on Linux. Viewports are not physical-device tests. Use fictional records. Failure fixtures run locally and return actual error responses.

## Acceptance cases

| ID        | Action                                                      | Expected result                                                                               |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| UI-01     | Load/filter services                                        | Six services; Tune-ups shows two; pressed state updates                                       |
| UI-02     | Choose tune-up and collection                               | Correct choice; estimate changes from $65 to $80                                              |
| UI-03     | Submit and track a sample                                   | Saved reference; new job selected in the same workspace                                       |
| UI-04     | Switch views and finish repair                              | Approval gates work; seven stages and journal persist                                         |
| UI-05     | Reload                                                      | Latest created repair and saved progress available                                            |
| UI-06     | Lose response and retry                                     | Existing repair returned; no duplicate                                                        |
| UI-07     | Action 409, then refresh 503                                | Truthful message and enabled reload; no false freshness claim                                 |
| UI-08     | Tab/Space on filters and repairs                            | Visible focus and correct activation                                                          |
| UI-09     | Inspect 390/768-pixel layouts                               | No document overflow; readable controls                                                       |
| UI-10     | Open project story and brief                                | Clear brief, outcomes, scope, and working links                                               |
| UI-11     | Switch with inline view controls                            | Same repair and stage; repair heading receives focus                                          |
| UI-12     | Filter ready/collected and empty results                    | Distinct counts; All repairs restores the list; reload preserves saved stages                 |
| UI-13     | Save an action/reset then lose response                     | Uncertain badge; further actions blocked until reload shows the actual saved result           |
| UI-14     | Service menu 503 then retry                                 | Menu recovers without page reload; bike and concern preserved                                 |
| UI-15     | Hold a request response                                     | Form and service-card choices disabled; confirmed save provides next step                     |
| UI-16     | Revise with parts/labour, approve, wait, resume and collect | Version-specific approval; waiting never skips the ride check; history survives reload        |
| UI-17     | Decline and request an alternative                          | Earlier decline retained; the new version requires a new approval                             |
| UI-18     | Dismiss then confirm cancellation                           | Dismissal changes nothing; confirmation closes the repair permanently                         |
| UI-19     | Lose response after a revised estimate saves                | Draft choices and preview retained; further changes blocked until reload                      |
| UI-20     | Inspect expanded editor and exception states                | No overflow or automated accessibility violations at all three test widths                    |
| API-01    | Submit choices with forged estimate                         | Server calculates $80                                                                         |
| API-02    | Invalid choices or personal fields                          | 422; no repair created                                                                        |
| API-03    | Malformed JSON, wrong media, >8192 bytes                    | 400, 415, or 413                                                                              |
| API-04    | Split UTF-8 café bytes                                      | Café cruiser intact                                                                           |
| API-05    | Separate visitors                                           | Isolated workspaces                                                                           |
| API-06    | Failed storage                                              | 503; no false confirmation                                                                    |
| API-07    | Request source, records, or package                         | 404                                                                                           |
| API-08    | Reuse reference with changed choices                        | 409; existing job unchanged                                                                   |
| REPAIR-01 | Workshop advance awaiting approval                          | Rejected; state unchanged                                                                     |
| REPAIR-02 | Advance after collection                                    | Rejected; journal unchanged                                                                   |
| REPAIR-03 | Two actions at same revision                                | One succeeds; stale update 409                                                                |
| REPAIR-04 | Restart local server                                        | Saved progress remains                                                                        |
| REPAIR-05 | Reset                                                       | New isolated starting workspace                                                               |
| REPAIR-06 | Reprice already-approved work                               | Approval cleared; work paused; previous approved quote remains historical                     |
| REPAIR-07 | Submit wrong quote version, forged price or invalid role    | Rejected without changing saved state                                                         |
| REPAIR-08 | Reach quote or journal limit                                | Growth bounded; existing records preserved                                                    |
| REPAIR-09 | Act on a repair saved by the previous release               | First quote derived without losing stages or history                                          |
| DEMO-01   | Exceed ten repairs                                          | Capacity preserved; request rejected                                                          |
| DEMO-02   | Access/update after expiry                                  | Old workspace inaccessible; new session possible                                              |
| DEMO-03   | Cleanup active/expired records                              | Expired records deleted only                                                                  |
| DEMO-04   | Expired record beyond first batch                           | Cursor resumes; later records not starved                                                     |
| HOST-01   | Build functions and public files                            | Both functions; 25 allowlisted static files                                                   |
| HOST-02   | Netlify Dev smoke check                                     | Integration checks pass through function/emulator; current 17-check suite verified separately |
| HOST-03   | Compete conditional writes                                  | One save, one 409; no duplicate history                                                       |
| HOST-04   | Change emulator version mid-read                            | Reject unreliable read                                                                        |
| HOST-05   | Inspect hosting configuration                               | API rate rule and hourly cleanup present                                                      |
| HOST-06   | Check owned public demo                                     | 24 hosted checks and HTTPS browser journey                                                    |

| APP-01 | Create from all-active catalog and retry reference | Server price snapshot; duplicate returns the saved repair |
| APP-02 | Edit catalog price, revisit website and create | Both screens show saved price; earlier estimates stay fixed |
| APP-03 | Assign date/mechanic and exceed capacity | Business timezone respected; only explicit job budgets counted; work/collection dates distinct; excessive allocations rejected |
| APP-04 | Approve several quoted parts | Quantities priced server-side; available stock reserved atomically |
| APP-05 | Competing repair or insufficient stock | No double reservation; shortage waits until receipt and explicit resume |
| APP-06 | Complete approved work | Inventory consumed once; stock ledger saved |
| APP-07 | Release before/after four checks | Rejected until all pass; ready/collected remain distinct |
| APP-08 | Record payment twice | Approved total recorded once; no external charge |
| APP-09 | Export and print | Actual records, safe CSV, no workspace ID, readable summary |
| APP-10 | Lose saved receipt response | Writes block; refresh confirms one receipt without duplication |
| APP-11 | Private sign-in/custom intake/logout/restart | Protected access; permanent records retained; expired sessions revoked |
| APP-12 | Wrong keys or cross-origin private requests | Throttling and exact origin checks; no session issued |
| APP-13 | All screens/dialogs at five configurations | No document overflow or automated accessibility violations; keyboard skip link works |

## Limits

Public execution is verified separately. Emulator results do not prove distributed concurrency. Physical devices, complete accessibility/security/load audits, independent staff/customer identities, external notifications/charges and appointment-slot bookings are outside this review. Private operator sessions and due-date scheduling are tested.

## Work-order release acceptance

- Migrate earlier repairs without rewriting quotes/decisions or merging matching customer names.
- Save customers and bikes, create repeat visits, edit descriptive records and preserve earlier repair snapshots.
- Configure service scope/units/decimal prices, unique compatible part models/SKUs and staff/shop availability.
- Flag existing schedule conflicts after configuration changes without silently rescheduling jobs.
- Itemize several services and parts under one current approval; exact cent totals and scope changes preserve historical decisions.
- Store private/shared photos and internal findings separately from recipient updates. Verify image bounds and denied private/unrelated image access.
- Open customer links in a browser context without workshop cookies. Reject forged fields, stale versions/revisions, expired/revoked links and external-origin decisions.
- Recover from a response lost after actual recipient approval without recording a second decision.
- Preserve photos and customer access across protected-server restart; remove media after failed concurrent writes or portfolio expiry.
- Exercise new forms and disclosures at both narrow widths with no suppressed accessibility rules.
