---
name: Payroll journal balancing
description: Double-entry treatment for Mavuno HR payroll general-ledger reports
---

The payroll GL must derive its journal from payslip line items, not only payroll-run summary fields. Debit gross payroll and employer contributions; credit every employee and employer liability, every employee deduction, net pay, and a non-cash benefit clearing line when applicable. For paid runs, net pay credits bank/cash; otherwise it credits net salaries payable.

**Why:** The earlier report omitted loan recoveries and other deductions, so the general ledger could show a plausible-looking but unbalanced journal.

**How to apply:** Whenever a payslip deduction or employer cost field is added, add its corresponding GL liability/expense line and preserve the debit-equals-credit control total.