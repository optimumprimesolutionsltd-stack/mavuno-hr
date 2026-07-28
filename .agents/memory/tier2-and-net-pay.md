---
name: Tier II provider and net-pay handling
description: Payroll needs to distinguish statutory Tier II destination from voluntary pension and gross up employees contracted on net salary.
---

The statutory configuration controls where mandatory NSSF Tier II is remitted: standard NSSF includes Tier I and Tier II, while a private-fund override sends only Tier I to NSSF and identifies the private fund for Tier II. Payslip breakdowns must preserve that provider snapshot so historical payslips and PDFs do not relabel the contribution after settings change.

**Why:** A provider choice shown only in reports is misleading when payslips and payroll calculations still call the contribution NSSF Tier II.

**How to apply:** Store the provider/name in each payroll snapshot or payslip breakdown; use an employee salary-basis flag so a target net salary is grossed up before statutory deductions rather than being treated as basic gross salary.