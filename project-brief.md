# Northline Workshop — Project brief

An independent repair-management application for a fictional bicycle workshop. No client relationship or commercial results are claimed.

## Problem and implemented product

A repair needs pricing, approval, capacity, parts, a checked bike and distinct collection/payment records. Six application screens connect twelve priced repair types to intake, a searchable queue, priorities, due dates, mechanic scheduling, inventory and operational reports.

Multi-part estimates retain quantities, totals and historical decisions. A revision requires approval of its exact version. Stock reservations prevent competing jobs from using the same units; shortages pause work, receipts allow resumption and completion consumes inventory. Four quality checks gate readiness. Notes, printable summaries, offline payment records and CSV/JSON exports complete the bounded workflow.

The original illustrated website shares persistent records. A protected Node installation adds operator sessions and custom customer/bike intake. Private records survive logout and restart; the hosted portfolio uses isolated fictional visitor workspaces.

## Engineering and evidence

Shared server-side rules validate actions, prices, quantities, stock and capacity. Conditional revisions prevent stale writes, intake references prevent duplicates, and uncertain saves block further actions until refresh. Price snapshots survive catalog edits. Local files are replaced atomically; cloud writes require storage versions. Public builds expose only allowlisted assets.

The repository includes isolated domain/server tests, full browser journeys in Chromium/Firefox/WebKit, responsive and accessibility checks, failure fixtures and a hosted integration checker. The QA report records actual release results. The operations guide covers installation, backup, restore, key rotation and growth limits.

## Boundaries

Offline payment records do not charge cards; summaries are not tax invoices. Customer view records communicated decisions and does not authenticate a separate customer. Staff permissions, outbound notifications, purchasing and multi-location operation remain outside this release. The competitor review identifies capabilities and commercial gaps without claiming parity or hiring outcomes.
