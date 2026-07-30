---
name: Email delivery safety
description: Rules for Gmail SMTP configuration and user-facing delivery failures
---

Normalize Gmail sender credentials at the mail boundary, especially app passwords copied with visual spaces between character groups. Provider authentication errors may be logged server-side for diagnosis, but browser responses must use a safe actionable message rather than exposing raw SMTP responses or provider links.

**Why:** Gmail authentication failures previously exposed the full SMTP response in payroll notifications, including provider diagnostic details, while copied app-password spacing could make valid credentials fail.

**How to apply:** Keep secrets in the managed environment-secret store, strip harmless app-password whitespace before creating the transporter, and map authentication, connection, and configuration failures to safe client messages.