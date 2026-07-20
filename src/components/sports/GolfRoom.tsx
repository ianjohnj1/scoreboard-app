import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent } from '../../lib/matches';
import UserAvatar from '../UserAvatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { GolfHole, GolfScore, Profile } from '../../lib/supabase';

const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  '-3': { label: 'Albatross', color: 'text-warning-400' },
  '-2': { label: 'Eagle', color: 'text-success-400' },
  '-1': { label: 'Birdie', color: 'text-success-300' },
  '0': { label: 'Par', color: 'text-charcoal-300' },
  '1': { label: 'Bogey', color: 'text-danger-400' },
  '2': { label: 'Double Bogey', color: 'text-danger-500' },
  '3': { label: 'Triple Bogey', color: 'text-danger-600' },
};

export default function GolfRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, isSpectator, currentUser, isAdmin, isTvDisplayMode } = ctx;

  const [holes, setHoles] = useState<GolfHole[]>([]);
  const [scores, setScores] = useState<Map<string, GolfScore>>(new Map()); // key: `${holeId}:${profileId}`
  const [selectedHole, setSelectedHole] = useState<GolfHole | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { 
      isMountedRef.current = false;
      if (abortControllerRef.current) abortControllerRef.current.abort();
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, []);

  const numHoles = (match.house_rules as Record<string, unknown>)?.holes as number ?? 18;

  const matchPlayers = players
    .map(p => profiles.get(p.profile_id))
    .filter(Boolean) as Profile[];

  const initializeHoles = async () => {
    if (isSpectator || loading) return;
    setLoading(true);
    setInitError(null);
    try {
      const courseData = (match.house_rules as any)?.course_data as { number: number; name: string; par: number }[] | null;
      
      const newHoles = courseData 
        ? courseData.map(h => ({
            match_id: match.id,
            hole_number: h.number,
            par: h.par,
            title: h.name || null
          }))
        : Array.from({ length: numHoles }, (_, i) => ({
            match_id: match.id,
            hole_number: i + 1,
            par: 4,
            title: null
          }));

      const { data, error: insertError } = await supabase.from('golf_holes').insert(newHoles).select();
      if (insertError) throw insertError;
      setHoles(data || []);
      return data;
    } catch (error: any) {
      console.error("Error initializing golf holes:", error);
      setInitError(error.message || "Failed to initialize holes");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  };

  const loadData = useCallback(async () => {
    // Abort any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      setLoading(true);
      // Ensure holes exist
      const { data: existingHoles, error: fetchError } = await supabase
        .from('golf_holes')
        .select('*')
        .eq('match_id', match.id)
        .order('hole_number')
        .abortSignal(signal);

      if (!isMountedRef.current) return;

      if (fetchError) {
        if (!fetchError.message?.includes('AbortError')) {
          throw fetchError;
        }
        return;
      }

      if (!existingHoles || existingHoles.length === 0) {
        // Only auto-init if not spectator
        if (!isSpectator) {
          await initializeHoles();
        }
      } else {
        setHoles(existingHoles);
      }

      const { data: scoreData, error: scoresError } = await supabase
        .from('golf_scores')
        .select('*')
        .eq('match_id', match.id)
        .abortSignal(signal);

      if (!isMountedRef.current) return;

      if (scoresError) {
        if (!scoresError.message?.includes('AbortError')) {
          throw scoresError;
        }
        return;
      }

      const scoreMap = new Map<string, GolfScore>();
      for (const s of scoreData || []) {
        scoreMap.set(`${s.hole_id}:${s.profile_id}`, s);
      }
      setScores(scoreMap);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('AbortError')) return;
      console.error("Error loading golf data:", error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [match.id, numHoles, isSpectator]);

  useEffect(() => { 
    loadData(); 
  }, [loadData]);

  // Subscribe to changes
  useEffect(() => {
    const handleRefresh = () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        loadData();
      }, 200); // 200ms debounce
    };

    const channel = supabase
      .channel(`golf:${match.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_holes', filter: `match_id=eq.${match.id}` }, () => handleRefresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golf_scores', filter: `match_id=eq.${match.id}` }, () => handleRefresh())
      .subscribe();
    return () => { 
      supabase.removeChannel(channel);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [match.id, loadData]);

  const updatePar = async (holeId: string, par: number) => {
    await supabase.from('golf_holes').update({ par }).eq('id', holeId);
    await loadData();
  };

  const setScore = async (holeId: string, profileId: string, strokes: number | null, holeInOne = false) => {
    if (!currentUser || loading) return;
    setLoading(true);
    try {
      const key = `${holeId}:${profileId}`;
      const existing = scores.get(key);
      if (existing) {
        await supabase.from('golf_scores').update({
          strokes,
          is_hole_in_one: holeInOne,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('golf_scores').insert({
          match_id: match.id,
          hole_id: holeId,
          profile_id: profileId,
          strokes,
          is_hole_in_one: holeInOne,
        });
      }
      await recordEvent(match.id, 'golf_score', { holeId, profileId, strokes, holeInOne }, profileId, undefined, currentUser.id);
      await loadData();
    } finally {
      setLoading(false);
    }
    setSelectedHole(null);
    setSelectedPlayer(null);
  };

  const getPlayerTotal = (profileId: string) => {
    let total = 0;
    let par = 0;
    for (const hole of holes) {
      const score = scores.get(`${hole.id}:${profileId}`);
      if (score?.strokes != null) {
        total += score.strokes;
        par += hole.par;
      }
    }
    return { total, toPar: total - par };
  };

  const formatToPar = (toPar: number) => {
    if (toPar === 0) return 'E';
    return toPar > 0 ? `+${toPar}` : `${toPar}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Summary */}
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 py-3">
        <div className="flex gap-4 overflow-x-auto no-scrollbar">
          {matchPlayers.map(p => {
            const { total, toPar } = getPlayerTotal(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 flex-shrink-0">
                <UserAvatar display_name={p.display_name} avatar_color={p.avatar_color} avatar_url={p.avatar_url} size="sm" />
                <div>
                  <p className="text-charcoal-100 text-sm font-semibold">{p.display_name}</p>
                  <p className="font-mono text-xs">
                    <span className="text-charcoal-300">{total}</span>
                    <span className={`ml-1.5 font-bold ${toPar === 0 ? 'text-charcoal-300' : toPar < 0 ? 'text-success-400' : 'text-danger-400'}`}>
                      {formatToPar(toPar)}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scorecard grid */}
      <div className="flex-1 overflow-auto bg-charcoal-900 relative">
        {holes.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            {loading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-accent-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-charcoal-400 font-bold animate-pulse uppercase tracking-widest text-xs">Initializing Course...</p>
              </div>
            ) : (
              <div className="max-w-xs space-y-6">
                <div className="w-20 h-20 bg-charcoal-800 rounded-3xl flex items-center justify-center text-4xl mx-auto shadow-xl border border-charcoal-700">
                  ⛳
                </div>
                <div>
                  <h3 className="text-xl font-black text-charcoal-50 mb-2 uppercase tracking-tight">No Holes Defined</h3>
                  <p className="text-charcoal-400 text-sm leading-relaxed">
                    The course hasn't been initialized yet. {isSpectator ? "Waiting for the host to start the game." : "Tap below to set up the scorecard."}
                  </p>
                </div>
                
                {!isSpectator && !isTvDisplayMode && (match.status !== 'completed' || isAdmin) && (
                  <div className="space-y-3">
                    <button
                      onClick={initializeHoles}
                      className="w-full py-4 bg-accent-600 hover:bg-accent-500 text-charcoal-50 font-black rounded-2xl shadow-lg shadow-accent-900/40 transition-all active:scale-95 uppercase tracking-widest text-sm"
                    >
                      Initialize {numHoles} Holes
                    </button>
                    {initError && (
                      <p className="text-danger-400 text-xs font-bold bg-danger-950/30 p-3 rounded-xl border border-danger-900/50">
                        ⚠️ {initError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {(isSpectator || isTvDisplayMode) && match.status !== 'completed' && holes.length > 0 && (
              <div className="p-4 pb-0">
                <div className="flex flex-col items-center justify-center py-4 bg-charcoal-800/30 rounded-2xl border border-charcoal-700">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-danger-500 animate-pulse" />
                    <h2 className="text-lg font-black text-charcoal-50 tracking-wide uppercase">Live Leaderboard</h2>
                  </div>
                </div>
              </div>
            )}
            <table className="w-full text-xs border-collapse scorecard-table mt-4">
            <thead className="sticky top-0 bg-charcoal-800 z-10 shadow-lg">
              <tr>
                <th className="text-left px-3 py-3 text-charcoal-400 font-bold uppercase tracking-wider border-b border-charcoal-700 min-w-[120px]">Hole</th>
                <th className="px-2 py-3 text-charcoal-400 font-bold uppercase tracking-wider border-b border-charcoal-700 w-12">Par</th>
                {matchPlayers.map(p => (
                  <th key={p.id} className="px-2 py-3 text-charcoal-100 font-bold uppercase tracking-wider border-b border-charcoal-700 min-w-[4.5rem]">
                    <div className="flex flex-col items-center gap-1">
                      <UserAvatar display_name={p.display_name} avatar_color={p.avatar_color} avatar_url={p.avatar_url} size="xs" />
                      <span className="truncate max-w-[60px]">{p.display_name.split(' ')[0]}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holes.map((hole, i) => (
                <tr key={hole.id} className={`border-b border-charcoal-800/50 ${i % 2 === 0 ? 'bg-charcoal-800/20' : ''}`}>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-charcoal-500 font-mono text-[10px] leading-none mb-1">Hole {hole.hole_number}</span>
                      <span className="text-charcoal-100 font-bold text-sm leading-tight truncate max-w-[100px]">
                        {hole.title || `Hole ${hole.hole_number}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-charcoal-800 text-charcoal-300 font-mono font-bold border border-charcoal-700">
                      {hole.par}
                    </span>
                  </td>
                  {matchPlayers.map(player => {
                    const score = scores.get(`${hole.id}:${player.id}`);
                    const toPar = score?.strokes != null ? score.strokes - hole.par : null;
                    const label = toPar != null ? (SCORE_LABELS[String(toPar) as keyof typeof SCORE_LABELS] || null) : null;
                    return (
                      <td key={player.id} className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => {
                            if (isSpectator || isTvDisplayMode) return;
                            if (match.status === 'completed' && !isAdmin) return;
                            setSelectedHole(hole);
                            setSelectedPlayer(player);
                          }}
                          className={`w-11 h-9 rounded-xl font-mono font-black text-base transition-all active:scale-90 relative overflow-hidden shadow-sm ${
                            score?.is_hole_in_one
                              ? 'bg-warning-500 text-charcoal-900 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                              : score?.strokes != null
                              ? `bg-charcoal-800 border-2 ${label ? label.color.replace('text-', 'border-').replace('400', '500/50').replace('300', '400/50') : 'border-charcoal-700'} ${label?.color ?? 'text-charcoal-200'}`
                              : 'bg-charcoal-900/50 border-2 border-dashed border-charcoal-800 text-charcoal-700 hover:border-charcoal-600 hover:text-charcoal-500 active:bg-charcoal-800/50'
                          }`}
                        >
                          {score?.is_hole_in_one ? (
                            <span className="flex items-center justify-center gap-0.5 animate-bounce">1<span className="text-[10px]">★</span></span>
                          ) : score?.strokes ?? (
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                          )}
                          {score?.strokes != null && !score.is_hole_in_one && toPar !== 0 && (
                            <div className={`absolute top-0 right-0 w-3 h-3 rounded-bl-lg ${toPar! < 0 ? 'bg-success-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-danger-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]'}`} />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-charcoal-600 bg-charcoal-800/80 backdrop-blur-sm sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.3)]">
                <td className="px-3 py-4 text-charcoal-300 font-black text-sm uppercase tracking-widest">Total</td>
                <td className="px-2 py-4 text-center">
                  <span className="text-charcoal-400 font-mono font-bold text-sm">
                    {holes.reduce((s, h) => s + h.par, 0)}
                  </span>
                </td>
                {matchPlayers.map(p => {
                  const { total, toPar } = getPlayerTotal(p.id);
                  return (
                    <td key={p.id} className="px-2 py-4 text-center">
                      <div className="font-mono font-black text-lg text-charcoal-50 leading-none mb-1">{total}</div>
                      <div className={`font-mono text-[10px] font-black px-1.5 py-0.5 rounded inline-block ${
                        toPar === 0 ? 'bg-charcoal-700 text-charcoal-400' : 
                        toPar < 0 ? 'bg-success-900/50 text-success-400' : 
                        'bg-danger-900/50 text-danger-400'
                      }`}>
                        {formatToPar(toPar)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Score input sheet */}
      {selectedHole && selectedPlayer && !isSpectator && (match.status !== 'completed' || isAdmin) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-charcoal-800 rounded-t-3xl border-t border-charcoal-700 p-6 safe-bottom shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <UserAvatar display_name={selectedPlayer.display_name} avatar_color={selectedPlayer.avatar_color} avatar_url={selectedPlayer.avatar_url} size="md" />
                <div>
                  <h3 className="font-black text-charcoal-50 text-lg uppercase tracking-tight">
                    {selectedHole.title || `Hole ${selectedHole.hole_number}`}
                  </h3>
                  <p className="text-charcoal-400 text-sm font-bold uppercase tracking-widest">
                    {selectedPlayer.display_name} • <span className="text-accent-400">Par {selectedHole.par}</span>
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelectedHole(null); setSelectedPlayer(null); }}
                className="w-10 h-10 rounded-full bg-charcoal-700 flex items-center justify-center text-charcoal-300 hover:bg-charcoal-600 transition-colors">
                ✕
              </button>
            </div>

            {/* Named Scoring Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Eagle', delta: -2, color: 'success', bg: 'bg-success-900/30', border: 'border-success-700/50', text: 'text-success-400' },
                { label: 'Birdie', delta: -1, color: 'success', bg: 'bg-success-950/20', border: 'border-success-800/50', text: 'text-success-300' },
                { label: 'Par', delta: 0, color: 'charcoal', bg: 'bg-charcoal-700', border: 'border-charcoal-600', text: 'text-charcoal-100' },
                { label: 'Bogey', delta: 1, color: 'danger', bg: 'bg-danger-950/20', border: 'border-danger-800/50', text: 'text-danger-300' },
                { label: 'Double Bogey', delta: 2, color: 'danger', bg: 'bg-danger-900/30', border: 'border-danger-700/50', text: 'text-danger-400' },
                { label: 'Triple Bogey', delta: 3, color: 'danger', bg: 'bg-danger-800/40', border: 'border-danger-600/50', text: 'text-danger-500' },
              ].map(btn => {
                const strokes = selectedHole.par + btn.delta;
                if (strokes < 1) return null;
                return (
                  <button
                    key={btn.label}
                    onClick={() => {
                      setScore(selectedHole.id, selectedPlayer.id, strokes);
                      // Auto-advance logic
                      const nextIdx = matchPlayers.findIndex(p => p.id === selectedPlayer.id) + 1;
                      if (nextIdx < matchPlayers.length) {
                        setSelectedPlayer(matchPlayers[nextIdx]);
                      } else {
                        const holeIdx = holes.findIndex(h => h.id === selectedHole.id);
                        if (holeIdx < holes.length - 1) {
                          setSelectedHole(holes[holeIdx + 1]);
                          setSelectedPlayer(matchPlayers[0]);
                        } else {
                          setSelectedHole(null);
                          setSelectedPlayer(null);
                        }
                      }
                    }}
                    disabled={loading}
                    className={`flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all active:scale-95 ${btn.bg} ${btn.border}`}
                  >
                    <span className={`text-[10px] uppercase font-black tracking-widest opacity-60 mb-1 ${btn.text}`}>{btn.label}</span>
                    <span className={`text-2xl font-black leading-none ${btn.text}`}>
                      {btn.delta > 0 ? `+${btn.delta}` : btn.delta === 0 ? 'E' : btn.delta}
                    </span>
                    <span className="text-[10px] font-mono mt-1 opacity-40">{strokes} strokes</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-3 mb-6">
              <button
                onClick={() => {
                  setScore(selectedHole.id, selectedPlayer.id, 1, true);
                  // Auto-advance logic
                  const nextIdx = matchPlayers.findIndex(p => p.id === selectedPlayer.id) + 1;
                  if (nextIdx < matchPlayers.length) {
                    setSelectedPlayer(matchPlayers[nextIdx]);
                  } else {
                    const holeIdx = holes.findIndex(h => h.id === selectedHole.id);
                    if (holeIdx < holes.length - 1) {
                      setSelectedHole(holes[holeIdx + 1]);
                      setSelectedPlayer(matchPlayers[0]);
                    } else {
                      setSelectedHole(null);
                      setSelectedPlayer(null);
                    }
                  }
                }}
                disabled={loading}
                className="w-full py-5 rounded-2xl border-2 font-black text-2xl text-warning-400
                           bg-warning-500/10 border-warning-500/50 shadow-[0_0_20px_rgba(245,158,11,0.2)]
                           active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-3"
              >
                ⭐ HOLE IN ONE! ⭐
              </button>
            </div>

            {/* Navigation and Manual Entry */}
            <div className="flex items-center justify-between pt-4 border-t border-charcoal-700">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const curr = scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? selectedHole.par;
                    setScore(selectedHole.id, selectedPlayer.id, Math.max(1, curr - 1));
                  }}
                  className="w-12 h-12 rounded-xl bg-charcoal-700 border border-charcoal-600 font-black text-xl flex items-center justify-center"
                >
                  −
                </button>
                <div className="flex flex-col items-center w-12">
                  <span className="text-[10px] uppercase font-bold text-charcoal-500 mb-0.5">Strokes</span>
                  <span className="font-mono font-black text-2xl text-charcoal-50 leading-none">
                    {scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? '-'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    const curr = scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? selectedHole.par;
                    setScore(selectedHole.id, selectedPlayer.id, curr + 1);
                  }}
                  className="w-12 h-12 rounded-xl bg-charcoal-700 border border-charcoal-600 font-black text-xl flex items-center justify-center"
                >
                  +
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const nextIdx = matchPlayers.findIndex(p => p.id === selectedPlayer.id) + 1;
                    if (nextIdx < matchPlayers.length) {
                      setSelectedPlayer(matchPlayers[nextIdx]);
                    } else {
                      // If last player, maybe go to next hole?
                      const holeIdx = holes.findIndex(h => h.id === selectedHole.id);
                      if (holeIdx < holes.length - 1) {
                        setSelectedHole(holes[holeIdx + 1]);
                        setSelectedPlayer(matchPlayers[0]);
                      } else {
                        setSelectedHole(null);
                        setSelectedPlayer(null);
                      }
                    }
                  }}
                  className="px-6 py-3 rounded-xl bg-accent-600 text-charcoal-50 font-black uppercase tracking-widest text-xs shadow-lg shadow-accent-900/40 active:scale-95 transition-all"
                >
                  Next Player →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
