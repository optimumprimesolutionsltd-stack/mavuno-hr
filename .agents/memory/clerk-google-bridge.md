---
name: Google identity bridge
description: Security boundary for using Replit-managed Clerk Google sign-in with Zawadi's existing local accounts
---

Clerk/Google authentication must remain an identity verification layer, not an authorization or provisioning layer. A verified Clerk email may receive a Zawadi session only when exactly one active local user matches it; the local user and organization continue to control role, employee access, suspension, disablement, and lockout state.

**Why:** Zawadi has curated organization memberships and role permissions. Automatic JIT provisioning or trusting Google claims for roles could create uncontrolled company accounts or bypass tenant boundaries.

**How to apply:** Keep the Clerk-to-Zawadi exchange same-origin and audit it as a Google login. Preserve local lockouts and disabled/suspended checks. Revoke both the local session and Clerk session on logout. Never expose Clerk tokens or credentials to the browser beyond the managed SDK session.