---
name: Report export safety
description: Multi-document report downloads and regulator report structure
---

When a report contains one document per employee, return a ZIP archive with separately named documents instead of a multi-document PDF or multiple browser downloads.

**Why:** Browsers do not reliably allow one authenticated response to trigger several independent downloads, while a single archive preserves the employee-by-employee document boundary.

**How to apply:** Keep the archive MIME type and filename aligned in the API and UI, sanitize employee-derived filenames, and keep regulator-facing report columns explicit about identifiers, rates, contributions, and totals.

For SHIF uploads, use the supplied Excel workbook contract exactly: visible `Sheet1`, hidden `Sheet2`, the nine headers in the uploaded order, and the identity-type lookup validation.

**Why:** The SHA upload template is an operational import contract, so adding report columns or changing the order can make an otherwise valid payroll file unusable.

For simplified P10A uploads, use a headerless 25-column positional CSV and quote every field; format monetary values with two decimals and thousands separators. For NSSF reference workbooks, use visible `Sheet1`, merged `A1:I1`, metadata rows 2–4, headers in row 5, and two-decimal monetary cells.

**Why:** KRA and NSSF imports depend on positional fields and workbook geometry, not just equivalent values.