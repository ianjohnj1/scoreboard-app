import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MatchEvent } from '../lib/supabase';

// Delta-syncs a match's live (is_undone = false) match_events log instead of
// re-fetching full history on every realtime signal - the same event log
// CLAUDE.md's Stats pipeline section measures at up to 453 rows/match.
//
// Correctness relies on one fact about undoLastEvent() (lib/matches.ts):
// it only ever flips is_undone on the CURRENT last live event, never an
// arbitrary older one. So walking backward from our cached tail, checking
// one row at a time, is guaranteed to find every undo - no range query
// needed. If that undo semantics ever changes (e.g. undo-any-event), this
// algorithm needs revisiting.
export function useMatchEvents(matchId: string) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const eventsRef = useRef<MatchEvent[]>([]);
  const isMountedRef = useRef(true);
  const syncingRef = useRef(false);
  const pendingResyncRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      // Another sync is already in flight - let it pick up this request
      // instead of racing it with a second concurrent fetch.
      pendingResyncRef.current = true;
      return;
    }
    syncingRef.current = true;

    try {
      while (true) {
        pendingResyncRef.current = false;

        // 1) Drop cached tail events that have since been undone. Bounded
        // to however many consecutive undos actually happened - normally 0.
        while (eventsRef.current.length > 0) {
          const last = eventsRef.current[eventsRef.current.length - 1];
          const { data, error } = await supabase
            .from('match_events')
            .select('is_undone')
            .eq('id', last.id)
            .maybeSingle();

          if (error) {
            console.error('Error checking match event undo state:', error);
            break;
          }
          if (data?.is_undone) {
            eventsRef.current = eventsRef.current.slice(0, -1);
          } else {
            break;
          }
        }

        // 2) Pull anything new since our cursor.
        const cursor = eventsRef.current.length
          ? eventsRef.current[eventsRef.current.length - 1].sequence_num
          : 0;

        const { data: newRows, error: fetchError } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .eq('is_undone', false)
          .gt('sequence_num', cursor)
          .order('sequence_num', { ascending: true });

        if (fetchError) {
          console.error('Error loading match events:', fetchError);
          break;
        }

        eventsRef.current = [...eventsRef.current, ...(newRows || [])];

        if (!pendingResyncRef.current) break;
      }

      if (isMountedRef.current) setEvents(eventsRef.current);
    } finally {
      syncingRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, [matchId]);

  // Full resync (drops the local cache first) - used on mount and whenever
  // the realtime channel (re)connects, so a signal missed while offline can
  // never leave the incremental cache silently wrong.
  const resync = useCallback(async () => {
    eventsRef.current = [];
    await sync();
  }, [sync]);

  useEffect(() => {
    eventsRef.current = [];
    setLoading(true);

    const channel = supabase
      .channel(`match-events:${matchId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` },
        () => { sync(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resync();
      });

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  return { events, loading, refresh: sync };
}
