-- =============================================================================
-- SERVICE ROLE GRANTS
--
-- Fixes a gap introduced by the rebuild: `permission denied for table
-- withdrawal_requests` on every server-side route.
--
-- WHAT HAPPENED
--   Stock Supabase ships default privileges that grant new objects in `public` to
--   postgres, anon, authenticated and service_role. Those defaults live in pg_default_acl
--   keyed by the SCHEMA's oid — so `drop schema public cascade` deleted them along with
--   everything else.
--
--   00000000000003_security.sql then granted deliberately to anon and authenticated, and
--   said nothing about service_role. Result: service_role held no table privileges at all.
--
--   It was not obvious because service_role has BYPASSRLS, which is easy to read as
--   "service_role can do anything". It cannot: BYPASSRLS skips row policies, it does not
--   skip GRANT. Row-level and privilege-level access are independent gates, and the
--   service key only ever cleared the first one.
--
-- WHY BLANKET GRANTS ARE CORRECT *HERE*
--   Everywhere else in this schema the rule is least privilege, because anon and
--   authenticated are the browser and the browser is hostile input. service_role is
--   different in kind: the key never reaches a client, it is the trusted server identity,
--   and every route that uses it goes through requireAdmin() or is itself the trust
--   boundary. Restricting it column-by-column would add no security — anything holding
--   that key can already act as the server — while guaranteeing this same outage again
--   the next time a table is added.
--
--   The CI guardrail that rejects `grant all on public.<table>` deliberately exempts
--   service_role for this reason.
-- =============================================================================

begin;

grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- And for everything created from here on, so adding a table does not silently break
-- the admin panel again.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- postgres owns these objects, but be explicit — the dashboard SQL editor and some
-- Supabase internals connect as postgres.
grant all on all tables    in schema public to postgres;
grant all on all sequences in schema public to postgres;
alter default privileges in schema public grant all on tables    to postgres;
alter default privileges in schema public grant all on sequences to postgres;

-- The client roles are untouched by the above: `grant ... to service_role` does not
-- widen anon or authenticated. checks/verify_security.sql still passes in full.

notify pgrst, 'reload schema';

commit;

select 'service_role privileges restored.' as result;
