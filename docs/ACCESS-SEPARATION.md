# Customer, staff and portfolio separation

## Delivered structure

| Area             | Pages                                  | Access and data                                                                                                              |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Customer website | `/`, `/customer.html#reference.secret` | Published service scope/prices, new repair requests, and a repair-specific view. No operator controls or directories.        |
| Private workshop | `/workshop.html`                       | Server-checked staff session before any records, photos, exports or mutations. One configured workshop key.                  |
| Portfolio demo   | `/demo/`, `/demo/workshop.html`        | Explicit fictional sample records in a separate expiring visitor workspace. Sample operator and customer previews stay here. |

The customer website reads `/api/public/services`, a field allowlist from the staff catalogue. New requests go to `/api/public/enquiries`; they create a customer, bike and repair in the protected staff workspace and return only a receipt and repair link. Matching a name or email never associates an anonymous request with an earlier customer or bike. Requests neither reserve appointments nor send messages.

`/api/staff/*` checks a valid operator session before injecting the fixed workspace identifier on the server. The client cannot select a private workspace using a demo cookie. `/api/demo/*` delegates only to sample storage and rejects private records, including older permanent workspaces. Older `/api/*` sample routes remain aliases on Netlify. The existing protected Node installation retains its gated legacy routes for compatibility.

Repair links use an opaque random reference plus a 256-bit secret. The reference maps to the workspace and repair only on the server; it does not expose the workspace identifier. The secret hash, reference and expiry must all match the selected repair. Shared updates/photos are allowlisted; private notes, diagnosis, other bikes, customer contact details, stock and team information stay out. Possession of a link grants access to its repair, rather than verifying an identity. Replacement or revocation invalidates it immediately. Earlier links using a workspace identifier need to be issued again.

## Staff sign-in and storage

Production requires a secret `NORTHLINE_OPERATOR_KEY` in the Netlify functions scope. It is never bundled into public assets. Missing configuration leaves the dashboard locked and public intake unavailable; the service menu and isolated demo remain available. Sessions use random tokens in Secure, HttpOnly, SameSite=Strict cookies. Only token hashes are stored. Sessions expire after eight hours, persist across function instances/restarts, and are revoked by sign-out or a key change. Failed-attempt counters persist and throttle eight wrong attempts within ten minutes. Cloud record changes use conditional writes; local authentication and workshop transactions serialize in one process.

The new Netlify private master starts without sample repairs. Existing visitor records remain demo records. Staff records are permanent within the bounded application limits. Session records, repair-link indexes and photos have explicit retention metadata. Back up the complete private data directory, including `tracker/`, `photos/`, `links/` and `auth/`; exports do not restore credentials or image bytes.

## Portfolio and operational limits

The owned deployment remains a fictional business. Public requests accept fictional contact details (`example.test` addresses, no real phone number). They exercise a real saved workflow in the private queue but do not book real work. `NORTHLINE_PUBLIC_MODE=live` explicitly enables ordinary contact details in a separately operated installation; it does not configure a real business, notifications, payment processing or privacy policies.

This version uses one workshop key. Individual staff accounts, permission tiers, multi-factor authentication and verified customer accounts are outside the release. The demo is intended to be openly editable sample data; do not put private business data there. Automated access tests and browser checks are evidence of the implemented boundaries, not an independent security audit.

## Acceptance and reassessment

- The homepage offers every active scoped service and its starting price, with no repair queue or operator role switch.
- A public request saves once, retains its choices on a failed response and produces only its own repair link. An index failure after a committed repair is recoverable by an identical retry.
- Unauthenticated staff reads/writes, forged demo cookies, workspace identifiers substituted into repair links and customer bearer tokens used on staff routes are denied.
- Staff can see the incoming repair and save an internal note plus a separate customer update. Only the shared update reaches the recipient.
- Sign-out removes records from the view and denies direct staff requests. Demo records remain independent of staff and customer records.
- Narrow-width layout, keyboard navigation and unsuppressed automated accessibility scans cover the customer website, locked staff view and recipient page alongside the existing workshop journeys.

Remaining product work should focus on an explicit real-shop operating decision, per-person staff identities and independent usability/security review. Adding operational dashboards to the customer homepage would undo the audience separation established here.
