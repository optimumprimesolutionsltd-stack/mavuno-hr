---
name: Wouter 3 + regexparam 3 routing patterns
description: How regexparam 3 interprets path wildcards in Wouter 3.3.x — critical for avoiding silent routing failures
---

## The Rule

In Wouter 3.3.x (uses regexparam 3.0.0), `path="/admin*"` does NOT create a "starts with /admin" prefix match. The `*` is treated as a regex quantifier on the preceding character (`n`), producing `/^\/admin*\/?$/i` — which only matches `/admin`, `/adminn`, etc., NOT `/admin/employees`.

**Why:** regexparam 3 changed wildcard semantics. Unlike Wouter 2 or express-style routing, bare `*` appended to a word is a regex quantifier, not a glob wildcard.

**How to apply:** Always split admin/portal sections into TWO routes:

```tsx
{/* Exact root path */}
<Route path="/admin">
  <AdminGuard><AdminLayout><AdminDashboard /></AdminLayout></AdminGuard>
</Route>

{/* All sub-pages — /admin/* matches /admin/X and /admin/X/Y */}
<Route path="/admin/*">
  <AdminGuard>
    <AdminLayout>
      <Switch>
        <Route path="/admin/employees" component={EmployeeList} />
        {/* ... other routes ... */}
        <Route><Redirect to="/admin" /></Route>
      </Switch>
    </AdminLayout>
  </AdminGuard>
</Route>
```

Verified patterns (regexparam 3.0.0):
- `path="/admin"` → `/^\/admin\/?$/i` → matches only `/admin` ✓
- `path="/admin/*"` → `/^\/admin\/(.*)\/?$/i` → matches `/admin/X`, `/admin/X/Y` ✓
- `path="/admin*"` → `/^\/admin*\/?$/i` → only matches `/admin` (quantifier bug) ✗
- `path="/admin/:rest*"` → `/^\/admin\/([^/]+?)\/?$/i` → matches `/admin/X` only, NOT bare `/admin` ✗
- `path="/admin{/:rest*}"` → invalid syntax, matches nothing ✗

Also: dashboard API response shape must match what the React component reads. The generated Orval client types don't throw on mismatches — it silently gives `undefined`, causing crashes.
