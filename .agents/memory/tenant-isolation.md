---
name: Tenant isolation
description: Organization boundaries must be enforced in sessions, every resource predicate, and every cross-tenant foreign-key join
---

Every authenticated database read or write involving tenant-owned data must constrain `orgId` from the server-side principal. URL IDs, body IDs, and earlier ownership checks are never sufficient on their own; child joins and mutations must repeat the organization predicate.

**Why:** Payroll, employee, filing, leave, loan, timesheet, report, portal, and notification records contain sensitive company data, and inconsistent foreign keys or future refactors can otherwise turn an ID-based lookup into cross-company disclosure or mutation.

**How to apply:** Validate session `orgId = user.orgId`; scope detail queries, updates, deletes, downloads, and report aggregation by principal `orgId`; join child records on both ID and organization; validate submitted foreign keys such as department and employee IDs against the principal organization.