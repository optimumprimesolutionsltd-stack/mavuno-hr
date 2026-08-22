---
name: Insurance premium deductions
description: Payroll treatment and historical repair rules for employee insurance premiums
---

An employee insurance premium is a real payroll deduction and must be included in total deductions and net pay. It is separate from insurance relief: the premium reduces cash pay, while the configured relief reduces PAYE. Historical runs created before this treatment need an idempotent, audited correction that adjusts only deductions and net pay without changing already-filed statutory amounts.

**Why:** Treating the premium only as a PAYE-relief input caused configured insurance deductions to be omitted from employee pay.

**How to apply:** Keep insurance visible as its own payslip/report line, include it in payroll journals as an insurance-premiums payable credit, and mark historical corrections so they cannot be applied twice.