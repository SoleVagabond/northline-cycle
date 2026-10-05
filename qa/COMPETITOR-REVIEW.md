# Northline product comparison

Reviewed October 4, 2026. This compares documented features of established repair-management products with Northline's implemented, tested demonstration. No vendor account was purchased or tested. Documentation establishes advertised behavior; it does not establish comparative usability, reliability, or customer satisfaction. No client or hiring outcomes are claimed.

| Area | Documented commercial benchmark | Northline after this update |
|---|---|---|
| Estimates and customer decisions | [RepairDesk](https://help.repairdesk.co/portal/en/kb/articles/how-can-i-create-and-manage-an-estimate) supports customer-portal estimate approval and prevents employee approval when customer approval is mandatory. | The current version requires a customer-view decision. Revised parts/labour pause work, earlier estimates retain their decisions, and stale versions cannot be approved. These views are available to all demo visitors and are not authenticated identities. |
| Parts and waiting states | [Lightspeed](https://retail-support.lightspeedhq.com/hc/en-us/articles/229131428-Creating-and-completing-work-orders) documents parts, estimates, waiting/custom statuses, inventory reservations, and work-order completion. | Controlled fictional parts and labour are calculated on the server. An approved repair can pause for parts and resume without skipping the ride check. Inventory reservation and supplier ordering are absent. |
| Workshop scheduling | [Citrus-Lime](https://howto.citruslime.com/creating-and-working-on-a-workshop-job/291794-scheduling-a-workshop-job) schedules jobs on a calendar, searches unscheduled jobs, and indicates overdue, on-hold, awaiting-parts, and collected jobs. | Repair-stage and exception filters exist. No staff-capacity calendar, due-date scheduling, or overdue queue has been implemented. |
| Customer communication and payment | [Lightspeed](https://retail-support.lightspeedhq.com/hc/en-us/articles/229131428-Creating-and-completing-work-orders) documents emailed quotes and online deposit requests. | All decisions happen inside the browser demonstration. There are no outbound messages, real payments, deposits, invoices, or refunds. |
| Operational overview | [Lightspeed Home](https://retail-support.lightspeedhq.com/hc/en-us/articles/360009800674-Understanding-Home) separates active, overdue, and finished work orders. | Approval, ready, collected, declined, waiting-for-parts, and cancelled filters support the sample workflow. Search, priority sorting, due dates, and operational reporting remain future work. |

## Assessment

Northline demonstrates a coherent part of a repair application: requests, persisted state, controlled prices, version-specific approval, exception paths, historical decisions, stale-write protection, and explicit recovery. The new branches make the application more representative of workshop work than the original single forward-moving sequence.

It is not comparable in overall product scope with the established systems above. Those systems document broader operational functions. Northline deliberately uses fictional choices, accessible role views, up to ten repairs, and seven-day workspaces. It has no authenticated customer/staff accounts, operational backup/recovery process, real inventory, communications, payment integration, or scheduling.

For the portfolio, the strongest evidence is the source, live repeatable journeys, and regression coverage. Visual polish and feature count alone cannot establish that it matches successful applicants' portfolios or predict hiring outcomes. A reviewer can inspect the business rules and reproduce the tests.

The next highest-value addition is a workshop queue with search, due dates, and priority ordering. Real identities and permission enforcement should precede commercial use. Scheduling, inventory, and communication would be separate substantial phases rather than small finishing touches.
