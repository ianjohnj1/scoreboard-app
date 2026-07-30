-- P0 (todo.md): recordEvent() in src/lib/matches.ts assigns sequence_num by
-- doing SELECT count(*) then INSERT ... count+1 - two round trips with a race
-- window between them. Two scorers hitting the same match at once (or a
-- retry, or CricketRoom's completeOverEarly() bulk-inserting several
-- dot-ball events using the same count-then-insert pattern) can both read
-- the same count and then collide on the UNIQUE(match_id, sequence_num)
-- constraint, so the second write fails outright. That caps concurrent
-- scorers per match at one, which matters far more at 100 users than at the
-- handful the app has today.
--
-- Moves sequence_num assignment into a BEFORE INSERT trigger so it's
-- computed and serialized inside Postgres instead of raced from two
-- separate client round trips. A transaction-scoped advisory lock keyed by
-- match_id blocks concurrent inserts for the *same* match only - each match
-- serializes independently, so this doesn't create a global bottleneck.
--
-- Verified against a scratch TEMP table (not the real schema) that a single
-- multi-row INSERT gets correctly incrementing values across its own rows
-- (Postgres advances row visibility between rows of the same statement, so
-- the max()-based read inside a later row's trigger sees earlier rows from
-- the same INSERT): four rows in one group came back 1,2,3,4 in insertion
-- order, a fifth row in an unrelated group came back 1. The cross-transaction
-- case (two different sessions racing) is handled by the advisory lock,
-- which the TEMP-table test didn't need to exercise since single-connection
-- statement ordering was the only thing in question there.
--
-- sequence_num is NOT NULL with no default and this trigger fires BEFORE
-- INSERT, so it fills the column whether or not the client sends a value -
-- the client no longer needs to compute one at all, and an old cached
-- client bundle that still sends its own guess gets silently overwritten
-- rather than causing a conflict.

CREATE OR REPLACE FUNCTION public.set_match_event_sequence_num()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Released automatically at transaction end; blocks only inserts for this
  -- same match_id from other concurrent transactions.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.match_id::text, 0));

  SELECT COALESCE(max(sequence_num), 0) + 1
    INTO NEW.sequence_num
    FROM match_events
   WHERE match_id = NEW.match_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_match_event_sequence_num ON public.match_events;

CREATE TRIGGER trg_set_match_event_sequence_num
  BEFORE INSERT ON public.match_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_match_event_sequence_num();
