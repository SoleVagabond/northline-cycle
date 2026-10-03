# Northline Cycle Co. — QA case study

**Verified:** October 3, 2026  
**Project type:** Personal demonstration; fictional business  
**Result:** 32 isolated tests and 12 smoke checks passed against both the plain server and Netlify Dev. The submitted-request journey, persistence, recovery, and responsive layouts were checked in Chromium. The production HTTPS site passed the same 12 checks.

## Current release

Everyday tune-up costs $65 in this fictional catalogue; collection raises the estimate to $80. The public form accepts controlled choices and a fixed fictional rider, rejecting personal fields and free-text notes. A saved request creates a repair in the same visitor workspace and returns its tracking reference.

A browser-created Café cruiser repair advanced through all seven stages: check-in, inspection, approval, work, ride check, readiness, and collection. Approval required Customer view; other steps used Workshop view. Reload retained the collected repair and its seven journal entries. The smoke checker repeats this journey through the hosting function and storage emulator.

Retrying a saved request returned its existing repair without a duplicate. Tests also cover the ten-repair limit, seven-day expiry, session renewal, cleanup with a saved scan cursor, visitor separation, failed saves, and conditional updates.

![Saved seven-stage repair](evidence/tracker-desktop.jpg)

## Observed defect QA-04 — failed refresh implied current progress had loaded

**Priority:** Medium  
**Status:** Corrected and retested

**Reproduce:** Return 409 for a tracker action, then 503 for the following refresh.

**Expected:** Explain that the update conflicted and the newest progress could not load. Offer recovery without claiming the displayed state is current.

**Actual:** The previous message could say newer progress had loaded even after the refresh failed.

**Correction:** Return an explicit refresh result and choose messaging from that result. Show an enabled **Reload saved progress** control. Lost-response messaging also explains that an update may already have saved.

**Retest:** A local proxy returned actual 409 and 503 responses. The browser displayed: “This repair changed, but the latest progress could not load. Reload saved progress before trying again.” The reload control was enabled.

![Truthful conflict recovery](evidence/recovery-latest-unavailable.jpg)

## Responsive and keyboard checks

Document widths measured 375 pixels in a 390-pixel frame and 753 in a 768-pixel frame, with no document-level horizontal overflow. The current narrow tracker shows readable stage labels, a wrapping timeline, the $80 estimate, approval state, and journal. Earlier keyboard checks verified filter activation and retained focus after repair selection.

Responsive checks used isolated same-origin frames because the narrow viewport override did not apply reliably. A QA-only proxy allowed framing; the app retains its `frame-ancestors 'none'` policy. These are Chromium rendering checks, not physical-device or cross-browser claims.

![Current narrow repair details](evidence/tracker-mobile-detail.jpg)

## Earlier defects retained as development history

### QA-01 — focus outline on unfocused buttons

An early selector began with `button,` instead of `button:focus-visible,`, giving every button an outline. Retesting the correction found no outline on an unfocused filter; Tab produced visible focus and Space selected its category.

![Corrected keyboard focus](evidence/focus-corrected.jpg)

### QA-02 — split-packet UTF-8 corruption

The early parser decoded each network chunk independently. Splitting the two bytes of `ë` in the then-supported fictional name `Zoë Rider` produced replacement characters. The fix collects bounded bytes and decodes UTF-8 once before parsing. The current regression uses the approved `café` bike choice and verifies Café cruiser survives split writes. The released form no longer accepts names or free-text notes.

### QA-03 — local hosting refused an approval

Netlify Blobs SDK 11.1.3's emulator omitted the GET ETag, so the adapter refused an update with 503. Local development now brackets a fresh read with matching list versions. A changing version remains an error. Hosted requests still require standard ETags and conditional writes.

All 12 smoke checks passed through Netlify Dev, including saved approval and stale-update rejection. Adapter tests cover stable/changing emulator versions and competing conditional writes. Emulator results do not establish distributed-storage guarantees.

Earlier enquiry screenshots remain historical evidence of the former form and its real storage-failure response. They do not describe the released form.

## Automated verification

- **32 isolated tests passed**, with no failures or skips.
- **12 smoke checks passed** against the plain server and **12 passed** through Netlify Dev and its Blobs emulator.
- Formatting, type checking, public-file preparation, and hosting-function compilation passed.
- The compiled API manifest includes `/api/*` and the 60-request/minute IP/domain rate rule. Cleanup is configured hourly.
- The app dependency audit reported zero findings. The separate deployment CLI retains upstream advisories documented in the project README.

[Automated test output](evidence/automated-tests.txt) · [Local smoke output](evidence/smoke-checks.txt) · [Hosting smoke output](evidence/hosting-smoke-checks.txt)

## Remaining limits

This creates fictional repairs and demonstrates workflow views available to every visitor. It does not authenticate users, send email, book appointments, or take payment. No complete accessibility, security, load, or cross-browser audit was performed. Expiry blocks access after seven days; deletion follows bounded cleanup. Rate limiting is not a spending cap. Public hosting requires separate checks, and configured scheduling alone does not prove execution.

## Deliverable

One working website with a supporting QA study: original illustrations, a connected repair workflow, source and hosting configuration, four observed defects with corrections, scoped evidence, and reproducible checks. No client relationship or commercial results are claimed.

## Hosted verification

[Live demo](https://northline-cycle-devin.netlify.app) · [Project story](https://northline-cycle-devin.netlify.app/case-study.html)

All 12 checks passed against production, including request persistence, all seven stages, reload, duplicate prevention, rejected personal fields, stale-update rejection, and private-file protection. The production manifest confirms both functions, the API rate rule, and the hourly cleanup schedule. No scheduled invocation has yet been observed.

[Hosted smoke output](evidence/hosted-smoke-checks.txt)

The browser-created City commuter repair also reached collection. A fresh navigation after the final deployment retained its seven journal entries, confirming that production workspace storage survives a new release.

![Collected repair on the live site](evidence/live-repair-collected.jpg)

[Published function and schedule configuration](evidence/hosting-config.json)
