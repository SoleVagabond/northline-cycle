# Installation and operations

## Protected installation

Install Node.js 22 or later, download the repository and open a terminal in it. The plain server needs no third-party runtime installation. In PowerShell 7:

```powershell
$env:NORTHLINE_OPERATOR_KEY = Read-Host 'Set a unique workshop key (16+ characters)' -MaskInput
npm start
```

Open `http://127.0.0.1:8788/workshop.html` and enter the key. Keep it securely; there is no email key-reset service. Never commit the key. For persistent operation, use a service manager's protected environment settings.

Without a key the staff dashboard stays locked and `/demo/` remains available for fictional sample work. The customer website is `/`, the staff dashboard is `/workshop.html` and the isolated demo workshop is `/demo/workshop.html`. Public requests use fictional details by default; `NORTHLINE_PUBLIC_MODE=live` explicitly enables real contact details in an operated installation. In private mode APIs require an operator session except access status and sign-in; the published service menu and new-request endpoint are public, and customer endpoints require their own repair-specific secret. Explicit demo APIs remain isolated from private records. Static assets contain no private records. Sessions last eight hours, are HttpOnly/SameSite=Strict, and are revoked by sign-out, expiry or a key change. Sessions persist across process restarts and cloud function instances. Eight wrong attempts in ten minutes temporarily throttle that address. The signed-in operator records workshop actions and can record communicated decisions. Customer view is an operator preview. A separate customer repair link allows the recipient to view and decide on one repair without an operator session; possession of a link does not verify the recipient's identity.

## Storage, backup and restore

Records are JSON files in `data/tracker/`; photos are separate JSON/base64 objects in `data/photos/`. Repair-link indexes are in `data/links/` and hashed sessions/throttle counters in `data/auth/`. Treat all four directories as private data. The default private workspace is `e12fb49a-1274-44f5-a2b0-63c9bffbd920.json`. This identifier is configuration, not a credential. `NORTHLINE_WORKSPACE_ID` selects another UUID; changing it opens another workspace rather than migrating records. New workspaces include three fictional examples.

Run **one Node process per data directory**. The transaction queue does not coordinate separate processes. Back up by stopping the server and copying the complete `data/` directory, including `tracker/`, `photos/`, `links/` and `auth/` to protected storage. Restore by stopping the server, retaining a copy of current files, restoring all four backed-up directories and restarting with the same workspace ID. Confirm queue counts, recent history and report totals. Private records do not have portfolio expiry.

CSV/JSON downloads omit the workspace identifier and **are not restorable backups**. There is no JSON import interface. Use stored workspace files for restoration. Downloaded workspace JSON includes photo descriptions and references, not the image bytes or usable customer secrets. Full backups retain customer-link hashes; revoke links after a suspected exposure. Private exports and backups can contain customer details; protect them accordingly.

## HTTPS and network settings

The server defaults to host `127.0.0.1` and port 8788. Set `PORT` for another local port. For remote access, place an HTTPS reverse proxy in front of the loopback listener and configure the exact controlled origin, without a trailing slash:

```powershell
$env:NORTHLINE_ORIGIN = 'https://workshop.your-domain.example'
$env:NORTHLINE_COOKIE_SECURE = 'true'
```

Replace the example with your own origin. Forward requests to the local Node server and preserve cookies. Keep the raw HTTP listener private and configure the operator key before startup. HTTPS origin checks and Secure cookies have isolated tests; no remote private installation has been provisioned or verified. On Netlify, configure a secret `NORTHLINE_OPERATOR_KEY` in the functions scope for the production context and redeploy. The dashboard then uses permanent site-scoped storage; the demo stays in visitor workspaces. The new Netlify private master starts with no sample repairs. The [access architecture](ACCESS-SEPARATION.md) documents the boundaries.

## Daily operation and recovery

Create from the service catalog to snapshot a starting service price. Inspect before confirming the charge and work description. Record compatible specifications for each replacement part. Plan work date and mechanic separately from the expected collection date; leave a bench budget unestimated or enter a job-specific internal estimate. Review the collection expectation when parts or findings change, and communicate updates separately. Revisions require approval of the current version. Approval reserves available parts or pauses for a shortage. Receive actual stock before resuming. Finishing work consumes parts; safety checks gate readiness. Only shifting may be recorded as not applicable on a bike without gear shifting; brakes, wheels/tyres and fasteners/ride check remain required. Record money already received and mark collection separately. Payment records do not process transactions; printouts are repair summaries rather than tax invoices. Notes/history are not cryptographically signed audit records.

- **Reload to confirm:** refresh to inspect the saved result before repeating an uncertain action. Further writes remain blocked until recovery succeeds.
- **Conflicting update:** refresh to load the newer workspace revision.
- **Sign in again:** session expiry, logout or key rotation revokes access, preserving records.
- **Storage unavailable:** check write access and disk space; retain current files before restoring a backup. Failed saves do not produce a success confirmation.
- **Rotate the key:** stop, change the environment value and restart. Old sessions are revoked; data remains.

## Explicit limits

Private mode permits 250 repairs, twelve quote versions per repair, 128 journal entries per repair and 200 stock movements per workspace. Receipts accept one to fifty units, on-hand stock caps at 500 per part, and quotes accept six distinct parts with quantities one to ten. Scheduling covers today through ninety days ahead and enforces a 480-minute planning ceiling per mechanic/day using explicitly entered job budgets. This is not productive shift availability or a turnaround guarantee. Unestimated jobs are displayed separately and do not contribute invented minutes. At least one repair type and mechanic stay active. Legacy price-only catalog edits accept $5 to $1,000; full service configuration and inspected line charges accept $0 to $5,000 with up to two decimal places. Estimates accept twelve distinct service lines, quantities one to ten, and six distinct compatible parts. Server totals use integer cents. Part specifications are recorded by the operator, not verified by a compatibility engine. Business dates use America/New_York. Services, parts/SKUs and staff settings are configurable; the four safety checks remain defined in source. Limits are 60 services, 100 part models, 12 staff, 500 customers and 1,000 bikes. Importing old repairs creates separate customer/bike records rather than merging people by name.

Exports remain available at capacity. Archive a stopped-server backup and select a separate workspace before reaching limits; automatic archival and unlimited storage are absent. There are no staff-specific accounts, customer identity verification, outbound email, purchasing, tax calculations, online charges or multi-location administration.

## Customer links and repair photos

Create a link from the repair's Customer repair link section, then copy it for manual sharing. The secret is shown only when created and is kept in the URL fragment. The server stores its hash and an opaque reference, not the usable secret or a workspace identifier in the link. Links issued in the older workspace-identifier format must be reissued. An anonymous public receipt can be reproduced only with its random request ID and server signing key; a changed, revoked or expired link cannot be restored by a retry. Creating a replacement link invalidates the earlier one; Revoke link disables access immediately. Private links last fourteen days; portfolio links expire with their seven-day workspace. Stale estimates/revisions cannot be approved. Do not send the operator key to customers. Remote recipients use the HTTPS Netlify deployment or an HTTPS private installation with a controlled origin; loopback links work only on the same computer.

Condition, diagnosis and Workshop note are internal. Only explicit Customer updates and photos selected as shared appear in the repair link. Up to six PNG/JPEG images per open repair are accepted, each at most 1 MB, 12 megapixels and 8192 pixels per side. Avoid sensitive image metadata before sharing. Photos persist across local restart and are stored in site-scoped Blobs in production; expired portfolio media is included in cleanup. No email or external message is sent by saving an update or creating a link.

Shop and staff availability changes do not silently rewrite existing schedules. Review the flagged plans in Shop & team, including shop closure, time off, inactive staff and exceeded bench budgets. Open hours describe the shop; staff bench budgets remain an explicit planning decision.
