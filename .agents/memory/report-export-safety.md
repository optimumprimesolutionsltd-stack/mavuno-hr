---
name: Report export safety
description: Multi-document report downloads and regulator report structure
---

When a report contains one document per employee, return a ZIP archive with separately named documents instead of a multi-document PDF or multiple browser downloads.

**Why:** Browsers do not reliably allow one authenticated response to trigger several independent downloads, while a single archive preserves the employee-by-employee document boundary.

**How to apply:** Keep the archive MIME type and filename aligned in the API and UI, sanitize employee-derived filenames, and keep regulator-facing report columns explicit about identifiers, rates, contributions, and totals.