-- get_current_session_profile_id, is_admin_session, and is_match_participant only read
-- session/profile/match state derived from the per-request x-session-id header; nothing
-- they read changes within a single statement, so they're safe as STABLE instead of the
-- default VOLATILE, which today forces Postgres to re-evaluate them per row instead of
-- once per query. can_score_match and is_match_host were already STABLE.

ALTER FUNCTION public.get_current_session_profile_id() STABLE;
ALTER FUNCTION public.is_admin_session() STABLE;
ALTER FUNCTION public.is_match_participant(uuid) STABLE;
