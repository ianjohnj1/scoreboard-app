# RLS Ground Rules

Written after a security sweep (2026-07-23) found that nearly every table in this
database was writable by anyone holding the public anon key — no login, no session,
no PIN required — because old, fully-permissive policies from before any
"hardening" migration were never dropped. Postgres combines multiple permissive
RLS policies for the same command with **OR**, so a single forgotten
`USING (true)` silently defeats every other, better-designed policy on that table.
These rules exist to stop that from happening again.

## Before touching any table's RLS

**Query the live policy set first, not just the migration files.** Migration
files are a history of intent, not a guarantee of current state — policies can
be created out-of-band (dashboard/SQL editor) and never show up in a migration.
Before adding or changing a policy on a table, run:

```sql
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = '<table>';
```

Drop **every** existing permissive policy for the command you're touching, not
just the one you remember creating. A forgotten duplicate reopens the hole even
after you've added a "correct" one.

## Column-level protection

A `USING (owner_id = current_user_id())` policy only restricts *which rows* a
caller can touch — it does nothing to restrict *which columns* they change.
Every row-ownership policy that guards a privileged or foreign-identity column
(`is_admin`, `is_guest`, `created_by`, `recorded_by`, etc.) needs a paired
`BEFORE INSERT/UPDATE` trigger that explicitly compares `OLD` vs `NEW` for those
columns and rejects unauthorized changes. See `guard_profiles_protected_columns`,
`guard_match_rooms_protected_columns`, and `guard_match_events` in
`supabase/migrations/20260723_rls_lockdown_step1.sql` for the pattern.

## Never trust a client-supplied "who did this" column

Any column that records who performed an action (`recorded_by`, `created_by`)
must be stamped server-side — either a trigger that overwrites it with
`get_current_session_profile_id()` regardless of client input, or a
`DEFAULT` tied to the session. Never take it verbatim from the request body.

## Identity and session bootstrapping belongs in an RPC, not raw table access

If a flow needs to "prove who I am, then get a session/token," that whole
sequence must happen atomically inside one `SECURITY DEFINER` Postgres function
(an RPC called via `supabase.rpc(...)`). Splitting it into two client-driven
requests — even back-to-back — is unsafe: RLS has no memory of what an earlier
request proved, so nothing stops a second, unrelated caller from performing the
second step (e.g. minting a session) for someone else's identity. This is why
`rpc_login`/`rpc_signup`/`rpc_resume_session` exist
(`supabase/migrations/20260723_rls_lockdown_step2.sql`) instead of the app
directly INSERTing into `active_sessions` after checking a PIN client-side.

A session/identity table itself (anything a `get_current_session_*()`-style
helper reads) should never have an open `SELECT` or `INSERT` policy for
anon/authenticated — treat it with the same paranoia as a password table. Only
the owning row's caller (matched by an opaque, unguessable id in a request
header) should be able to read/update/delete it, and only a `SECURITY DEFINER`
RPC should be able to create new rows.

## SECURITY DEFINER functions

Every `SECURITY DEFINER` function must pin `SET search_path = public, pg_temp`
at creation time, and fully qualify any extension function it calls from a
non-`public` schema (e.g. `extensions.digest(...)`, not bare `digest(...)`) —
Supabase installs `pgcrypto` and friends into an `extensions` schema, not
`public`, so pinning `search_path` without qualifying the call will break at
runtime, not just silently widen an attack surface.

## Hiding a sensitive column is not just `REVOKE`

`REVOKE SELECT ON table FROM role` plus a narrower column-level `GRANT` does
**not** make `SELECT *` silently omit the revoked column — Postgres expands `*`
to every column of the table and fails the whole query if the role lacks
privilege on any one of them (confirmed directly: this broke the player picker
and leaderboard in this app on first attempt). If a column needs to be hidden
from a role that still needs to read the rest of the row, every call site must
enumerate an explicit safe column list (see `SAFE_PROFILE_COLUMNS` in
`src/lib/supabase.ts`) instead of `select('*')`/bare `select()` — including
`INSERT ... RETURNING` and `UPDATE ... RETURNING` chains, not just plain reads.

## Public-by-design policies need a comment

Any `USING (true)`, `WITH CHECK (true)`, or `TO anon` grant should carry an
inline SQL comment explaining why it's intentionally open (e.g. "leaderboards
are meant to be public"). A policy with a bare `true` and no justification
should not survive review.

## Shared-operator patterns aren't the same as broken RLS

Some features intentionally have one session acting on behalf of many
identities within a bounded resource — e.g. one scorekeeper entering every
player's numbers in a match. Don't retrofit strict per-row `profile_id`
ownership onto that pattern reflexively; it breaks the real workflow. Model the
actual allowed actor set explicitly instead (see `is_match_host()` /
`can_score_match()` in `20260723_rls_lockdown_step1.sql`), rather than either
leaving the table fully open or over-restricting it to "only the row's owner."

## Track schema in migrations, not just ALTERs

This audit was harder than it should have been because the core tables
(`profiles`, `match_rooms`, etc.) were created directly via the Supabase
dashboard, with no `CREATE TABLE` in any migration. There's no single source of
truth for a table's full column list, defaults, or constraints from source
alone. New tables should always get a migration-tracked `CREATE TABLE`.

## Pre-release checklist

Before merging any migration that touches RLS:

1. Re-run the `pg_policies` query for every table you touched and read every
   row — don't just check that your new policy exists.
2. Grep the whole `supabase/migrations/` folder for `USING (true)`,
   `WITH CHECK (true)`, and bare `FOR ALL` — confirm each surviving one has a
   justification comment.
3. Test the actual client flow end-to-end (not just the SQL) with a real anon-key
   request, including any `RETURNING`/`select()` chains — column-privilege
   failures don't show up from a privileged CLI/service-role connection.
