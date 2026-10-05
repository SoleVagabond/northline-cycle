# Installation and operations

## Protected installation

Install Node.js 22 or later, download the repository and open a terminal in it. The plain server needs no third-party runtime installation. In PowerShell 7:

```powershell
$env:NORTHLINE_OPERATOR_KEY = Read-Host 'Set a unique workshop key (16+ characters)' -MaskInput
npm start
```

Open `http://127.0.0.1:8788/workshop.html` and enter the key. Keep it securely; there is no email key-reset service. Never commit the key. For persistent operation, use a service manager's protected environment settings.

Without a key the server runs in portfolio mode. In private mode APIs require an operator session except access status and sign-in. Static assets contain no private records. Sessions last eight hours, are HttpOnly/SameSite=Strict, and are revoked by sign-out or server restart. Eight wrong attempts in ten minutes temporarily throttle that address. The signed-in operator records workshop actions and communicated customer decisions; Customer view does not authenticate a separate customer.

## Storage, backup and restore

Records are JSON files in `data/tracker/`. The default private workspace is `e12fb49a-1274-44f5-a2b0-63c9bffbd920.json`. This identifier is configuration, not a credential. `NORTHLINE_WORKSPACE_ID` selects another UUID; changing it opens another workspace rather than migrating records. New workspaces include three fictional examples.

Run **one Node process per data directory**. The transaction queue does not coordinate separate processes. Back up by stopping the server and copying the complete `data/tracker/` directory to protected storage. Restore by stopping the server, retaining a copy of current files, restoring the backed-up directory and restarting with the same workspace ID. Confirm queue counts, recent history and report totals. Private records do not have portfolio expiry.

CSV/JSON downloads omit the workspace identifier and **are not restorable backups**. There is no JSON import interface. Use stored workspace files for restoration. Private exports and backups can contain customer details; protect them accordingly.

## HTTPS and network settings

The server defaults to host `127.0.0.1` and port 8788. Set `PORT` for another local port. For remote access, place an HTTPS reverse proxy in front of the loopback listener and configure the exact controlled origin, without a trailing slash:

```powershell
$env:NORTHLINE_ORIGIN = 'https://workshop.your-domain.example'
$env:NORTHLINE_COOKIE_SECURE = 'true'
```

Replace the example with your own origin. Forward requests to the local Node server and preserve cookies. Keep the raw HTTP listener private and configure the operator key before startup. HTTPS origin checks and Secure cookies have isolated tests; no remote private installation has been provisioned or verified. These variables do not convert the existing public Netlify portfolio into a private installation.

## Daily operation and recovery

Create from the service catalog to snapshot a starting service price. Inspect before confirming the charge and work description. Record compatible specifications for each replacement part. Plan work date and mechanic separately from the expected collection date; leave a bench budget unestimated or enter a job-specific internal estimate. Review the collection expectation when parts or findings change, and communicate updates separately. Revisions require approval of the current version. Approval reserves available parts or pauses for a shortage. Receive actual stock before resuming. Finishing work consumes parts; safety checks gate readiness. Only shifting may be recorded as not applicable on a bike without gear shifting; brakes, wheels/tyres and fasteners/ride check remain required. Record money already received and mark collection separately. Payment records do not process transactions; printouts are repair summaries rather than tax invoices. Notes/history are not cryptographically signed audit records.

- **Reload to confirm:** refresh to inspect the saved result before repeating an uncertain action. Further writes remain blocked until recovery succeeds.
- **Conflicting update:** refresh to load the newer workspace revision.
- **Sign in again:** session expiry, logout or server restart revokes access, preserving records.
- **Storage unavailable:** check write access and disk space; retain current files before restoring a backup. Failed saves do not produce a success confirmation.
- **Rotate the key:** stop, change the environment value and restart. Old sessions are revoked; data remains.

## Explicit limits

Private mode permits 250 repairs, twelve quote versions per repair, 128 journal entries per repair and 200 stock movements per workspace. Receipts accept one to fifty units, on-hand stock caps at 500 per part, and quotes accept six distinct parts with quantities one to ten. Scheduling covers today through ninety days ahead and enforces a 480-minute planning ceiling per mechanic/day using explicitly entered job budgets. This is not productive shift availability or a turnaround guarantee. Unestimated jobs are displayed separately and do not contribute invented minutes. At least one repair type stays active. Catalog starting prices are whole USD values from $5 to $1,000; inspected service charges range from $0 to $5,000 and require a work description. Part specifications are recorded by the operator, not verified by a compatibility engine. Business dates use America/New_York. Catalog items, mechanics, checklist and part definitions are fixed source configuration.

Exports remain available at capacity. Archive a stopped-server backup and select a separate workspace before reaching limits; automatic archival and unlimited storage are absent. There are no staff-specific accounts, customer identity verification, outbound email, purchasing, tax calculations, online charges or multi-location administration.
