# Northline Cycle Co. — test plan

## Scope and environment

One fictional workshop website: service selection, estimates, controlled sample requests, repair stages, approval, persistence, visitor separation, retries, recovery, expiry, and hosting integration.

Windows, Node.js 22.14.0, Chromium desktop rendering, and isolated 390/768-pixel frames. Frames are not physical-device tests. Use fictional choices only. Failure fixtures run locally and return actual error responses.

## Acceptance cases

| ID | Action | Expected result |
|---|---|---|
| UI-01 | Load/filter services | Six services; Tune-ups shows two; pressed state updates |
| UI-02 | Choose tune-up and collection | Correct choice; estimate changes from $65 to $80 |
| UI-03 | Submit and track a sample | Saved reference; new job selected in the same workspace |
| UI-04 | Switch views and finish repair | Approval gates work; seven stages and journal persist |
| UI-05 | Reload | Latest created repair and saved progress available |
| UI-06 | Lose response and retry | Existing repair returned; no duplicate |
| UI-07 | Action 409, then refresh 503 | Truthful message and enabled reload; no false freshness claim |
| UI-08 | Tab/Space on filters and repairs | Visible focus and correct activation |
| UI-09 | Inspect 390/768-pixel layouts | No document overflow; readable controls |
| UI-10 | Open project story and brief | Clear brief, outcomes, scope, and working links |
| UI-11 | Switch with inline view controls | Same repair and stage; repair heading receives focus |
| UI-12 | Filter ready/collected and empty results | Distinct counts; All repairs restores the list; reload preserves saved stages |
| UI-13 | Save an action/reset then lose response | Uncertain badge; further actions blocked until reload shows the actual saved result |
| UI-14 | Service menu 503 then retry | Menu recovers without page reload; bike and concern preserved |
| UI-15 | Hold a request response | Form and service-card choices disabled; confirmed save provides next step |
| API-01 | Submit choices with forged estimate | Server calculates $80 |
| API-02 | Invalid choices or personal fields | 422; no repair created |
| API-03 | Malformed JSON, wrong media, >8192 bytes | 400, 415, or 413 |
| API-04 | Split UTF-8 café bytes | Café cruiser intact |
| API-05 | Separate visitors | Isolated workspaces |
| API-06 | Failed storage | 503; no false confirmation |
| API-07 | Request source, records, or package | 404 |
| API-08 | Reuse reference with changed choices | 409; existing job unchanged |
| REPAIR-01 | Workshop advance awaiting approval | Rejected; state unchanged |
| REPAIR-02 | Advance after collection | Rejected; journal unchanged |
| REPAIR-03 | Two actions at same revision | One succeeds; stale update 409 |
| REPAIR-04 | Restart local server | Saved progress remains |
| REPAIR-05 | Reset | New isolated starting workspace |
| DEMO-01 | Exceed ten repairs | Capacity preserved; request rejected |
| DEMO-02 | Access/update after expiry | Old workspace inaccessible; new session possible |
| DEMO-03 | Cleanup active/expired records | Expired records deleted only |
| DEMO-04 | Expired record beyond first batch | Cursor resumes; later records not starved |
| HOST-01 | Build functions and public files | Both functions; 18 allowlisted static files |
| HOST-02 | Netlify Dev smoke check | 12 checks pass through function/emulator |
| HOST-03 | Compete conditional writes | One save, one 409; no duplicate history |
| HOST-04 | Change emulator version mid-read | Reject unreliable read |
| HOST-05 | Inspect hosting configuration | API rate rule and hourly cleanup present |
| HOST-06 | Check owned public demo | 12 hosted checks and HTTPS browser journey |

## Limits

Public execution is verified separately. Emulator results do not prove distributed concurrency. Physical devices, broad compatibility, complete accessibility/security/load audits, real accounts, notifications, payments, and calendar bookings are outside this review.
