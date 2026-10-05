# Northline Cycle Co. — Project brief

Personal demonstration for a fictional bicycle workshop. No client relationship or commercial results are claimed.

## Brief

Help a rider choose a service, understand the labour estimate, and follow a repair. Demonstrate the workshop’s responsibilities through a clear sequence of stages.

## Implementation

An original responsive website with six illustrated services, server-calculated estimates, a sample request form, and a seven-stage repair tracker. Each request creates a repair in the visitor’s saved workspace. Inspection pauses for customer approval before work continues. Versioned estimates retain previous totals and decisions. Revised labour/parts prices require approval of the exact current version. Declines, alternative offers, waiting for parts, and terminal cancellation have enforced transitions. A journal records the stages and decisions. Inline view handoffs keep the same repair open, responsibility labels explain the next action, and separate ready/collected filters distinguish collection from completion. Estimates break out labour and local collection.

## Reliability and demo scope

Saved confirmations, duplicate-request protection, conditional updates, clear retry behavior, locked choices during submission, action blocking until uncertain progress is reloaded, recoverable service-menu failures, separate visitor workspaces, and seven-day expiry. The form accepts controlled sample choices only. No personal contact details, real bookings, emails, payments, or authenticated accounts are included.

## Verification

The companion QA case study contains the test plan, observed defects and corrections, browser evidence, regression results, and local hosting checks. Exact counts and hosted verification are recorded there after each release.

## Handoff

The repository README explains setup, storage, deployment, limits, and the file structure. The project is intended to demonstrate business websites, small interactive workflows, and practical website QA.
