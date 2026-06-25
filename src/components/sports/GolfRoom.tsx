import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent } from '../../lib/matches';
import Avatar from '../Avatar';
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
  const { match, players, profiles, isSpectator, currentUser } = ctx;

  const [holes, setHoles] = useState<GolfHole[]>([]);
  const [scores, setScores] = useState<Map<string, GolfScore>>(new Map()); // key: `${holeId}:${profileId}`
  const [selectedHole, setSelectedHole] = useState<GolfHole | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const numHoles = (match.house_rules as Record<string, unknown>)?.holes as number ?? 18;

  const matchPlayers = players
    .map(p => profiles.get(p.profile_id))
    .filter(Boolean) as Profile[];

  const loadData = useCallback(async () => {
    try {
      // Ensure holes exist
      const { data: existingHoles, error: fetchError } = await supabase
        .from('golf_holes')
        .select('*')
        .eq('match_id', match.id)
        .order('hole_number');

      if (fetchError) throw fetchError;

      let holeList = existingHoles || [];
      if (holeList.length === 0) {
        const newHoles = Array.from({ length: numHoles }, (_, i) => ({
          match_id: match.id,
          hole_number: i + 1,
          par: 4,
        }));
        const { data, error: insertError } = await supabase.from('golf_holes').insert(newHoles).select();
        if (insertError) throw insertError;
        holeList = data || [];
      }
      setHoles(holeList);

      const { data: scoreData, error: scoresError } = await supabase
        .from('golf_scores')
        .select('*')
        .eq('match_id', match.id);

      if (scoresError) throw scoresError;

      const scoreMap = new Map<string, GolfScore>();
      for (const s of scoreData || []) {
        scoreMap.set(`${s.hole_id}:${s.profile_id}`, s);
      }
      setScores(scoreMap);
    } catch (error) {
      console.error("Error loading golf data:", error);
    }
  }, [match.id, numHoles]);

  useEffect(() => { loadData(); }, [loadData]);

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
                <Avatar name={p.display_name} color={p.avatar_color} size="sm" />
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
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-charcoal-800 z-10">
            <tr>
              <th className="text-left px-3 py-2 text-charcoal-400 font-semibold w-8">Hole</th>
              <th className="px-2 py-2 text-charcoal-400 font-semibold w-12">Par</th>
              {matchPlayers.map(p => (
                <th key={p.id} className="px-2 py-2 text-charcoal-200 font-semibold min-w-[4rem]">
                  {p.display_name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {holes.map((hole, i) => (
              <tr key={hole.id} className={`border-t border-charcoal-800 ${i % 2 === 0 ? 'bg-charcoal-900/30' : ''}`}>
                <td className="px-3 py-2 text-charcoal-300 font-mono font-semibold">{hole.hole_number}</td>
                <td className="px-2 py-2 text-center">
                  {isSpectator ? (
                    <span className="text-charcoal-400 font-mono">{hole.par}</span>
                  ) : (
                    <select
                      value={hole.par}
                      onChange={e => updatePar(hole.id, Number(e.target.value))}
                      className="bg-transparent text-charcoal-400 font-mono text-xs border-none outline-none w-8 text-center"
                    >
                      {[3, 4, 5].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  )}
                </td>
                {matchPlayers.map(player => {
                  const score = scores.get(`${hole.id}:${player.id}`);
                  const toPar = score?.strokes != null ? score.strokes - hole.par : null;
                  const label = toPar != null ? (SCORE_LABELS[String(toPar) as keyof typeof SCORE_LABELS] || null) : null;
                  return (
                    <td key={player.id} className="px-2 py-2 text-center">
                      <button
                        onClick={() => {
                          if (isSpectator) return;
                          setSelectedHole(hole);
                          setSelectedPlayer(player);
                        }}
                        className={`w-10 h-8 rounded-lg font-mono font-bold text-sm transition-colors ${
                          score?.is_hole_in_one
                            ? 'bg-warning-500 text-charcoal-900 animate-hole-in-one'
                            : score?.strokes != null
                            ? `bg-charcoal-700 ${label?.color ?? 'text-charcoal-200'}`
                            : 'bg-charcoal-800 border border-dashed border-charcoal-700 text-charcoal-600'
                        }`}
                      >
                        {score?.is_hole_in_one ? '1★' : score?.strokes ?? '-'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Totals row */}
            <tr className="border-t-2 border-charcoal-600 bg-charcoal-800">
              <td className="px-3 py-2 text-charcoal-300 font-bold text-xs">TOT</td>
              <td className="px-2 py-2 text-center text-charcoal-400 font-mono text-xs">
                {holes.reduce((s, h) => s + h.par, 0)}
              </td>
              {matchPlayers.map(p => {
                const { total, toPar } = getPlayerTotal(p.id);
                return (
                  <td key={p.id} className="px-2 py-2 text-center">
                    <div className="font-mono font-bold text-sm text-charcoal-100">{total}</div>
                    <div className={`font-mono text-xs font-semibold ${toPar === 0 ? 'text-charcoal-400' : toPar < 0 ? 'text-success-400' : 'text-danger-400'}`}>
                      {formatToPar(toPar)}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Score input sheet */}
      {selectedHole && selectedPlayer && !isSpectator && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="w-full bg-charcoal-800 rounded-t-2xl border-t border-charcoal-700 p-4 safe-bottom">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-charcoal-100">
                  Hole {selectedHole.hole_number} — {selectedPlayer.display_name}
                </h3>
                <p className="text-charcoal-400 text-sm">Par {selectedHole.par}</p>
              </div>
              <button onClick={() => { setSelectedHole(null); setSelectedPlayer(null); }}
                className="p-1.5 rounded-lg hover:bg-charcoal-700 text-charcoal-400">
                ✕
              </button>
            </div>
            {/* Quick score buttons relative to par */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[-2, -1, 0, 1, 2, 3].map(delta => {
                const strokes = selectedHole.par + delta;
                if (strokes < 1) return null;
                const label = SCORE_LABELS[String(delta) as keyof typeof SCORE_LABELS];
                return (
                  <button
                    key={delta}
                    onClick={() => setScore(selectedHole.id, selectedPlayer.id, strokes)}
                    disabled={loading}
                    className={`py-3 rounded-xl border font-bold text-center transition-all active:scale-95 ${
                      label?.color || 'text-charcoal-100'
                    } ${
                      delta < 0 ? 'bg-success-900/30 border-success-700/40' :
                      delta > 0 ? 'bg-danger-900/30 border-danger-700/40' :
                      'bg-charcoal-700 border-charcoal-600'
                    }`}
                  >
                    <div className="text-lg">{delta > 0 ? `+${delta}` : delta === 0 ? 'E' : delta}</div>
                    <div className="text-xs opacity-70">{label?.label || strokes}</div>
                    <div className="text-xs font-mono opacity-50">{strokes} strokes</div>
                  </button>
                );
              })}
            </div>
            {/* Stepper */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-charcoal-400 text-sm">Custom strokes:</span>
              <div className="flex items-center gap-3">
                <button onClick={() => {
                  const curr = scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? selectedHole.par;
                  setScore(selectedHole.id, selectedPlayer.id, Math.max(1, curr - 1));
                }} className="w-10 h-10 rounded-xl bg-charcoal-700 border border-charcoal-600 font-bold text-lg flex items-center justify-center">−</button>
                <span className="font-mono font-bold text-2xl text-charcoal-100 w-8 text-center">
                  {scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? '-'}
                </span>
                <button onClick={() => {
                  const curr = scores.get(`${selectedHole.id}:${selectedPlayer.id}`)?.strokes ?? selectedHole.par;
                  setScore(selectedHole.id, selectedPlayer.id, curr + 1);
                }} className="w-10 h-10 rounded-xl bg-charcoal-700 border border-charcoal-600 font-bold text-lg flex items-center justify-center">+</button>
              </div>
            </div>
            {/* Hole in One! */}
            <button
              onClick={() => setScore(selectedHole.id, selectedPlayer.id, 1, true)}
              disabled={loading}
              className="w-full py-4 rounded-xl border-2 font-black text-xl text-warning-400
                         bg-warning-500/10 border-warning-500/50 animate-hole-in-one
                         active:scale-95 transition-all duration-150"
            >
              ⭐ HOLE IN ONE! ⭐
            </button>
          </div>
        </div>
      )}
    </div>
  );
}