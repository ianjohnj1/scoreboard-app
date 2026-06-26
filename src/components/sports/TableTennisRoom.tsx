import React, { useState } from 'react';
import { recordEvent } from '../../lib/matches';
import Avatar from '../Avatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile } from '../../lib/supabase';

type TTState = {
  scores: [number, number]; // [team0, team1] or [p0, p1]
  sets: [number, number];
  serving: number;
};

export default function TableTennisRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser, isAdmin } = ctx;
  const winPoints = (match.house_rules as Record<string, unknown>)?.win_points as number ?? 11;

  const isTeam = teams.length >= 2;
  const p0 = isTeam ? teams[0] : (() => {
    const pl = players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];
    return pl[0];
  })();
  const p1 = isTeam ? teams[1] : (() => {
    const pl = players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];
    return pl[1];
  })();

  const [state, setState] = useState<TTState>({ scores: [0, 0], sets: [0, 0], serving: 0 });

  const addPoint = async (idx: 0 | 1) => {
    const newScores: [number, number] = [...state.scores] as [number, number];
    newScores[idx]++;

    // Win by 2, min winPoints
    const wins = newScores[idx] >= winPoints && (newScores[idx] - newScores[1 - idx]) >= 2;
    if (wins) {
      const newSets: [number, number] = [...state.sets] as [number, number];
      newSets[idx]++;
      setState({ scores: [0, 0], sets: newSets, serving: (state.serving + 1) % 2 });
      await recordEvent(match.id, 'tt_set', { winner: idx, sets: newSets }, undefined, undefined, currentUser?.id);
    } else {
      setState(s => ({ ...s, scores: newScores }));
      await recordEvent(match.id, 'tt_point', { player: idx, score: newScores }, undefined, undefined, currentUser?.id);
    }
  };

  const getName = (e: typeof p0) => e && ('team_name' in e ? (e as { team_name: string }).team_name : (e as Profile).display_name);
  const getColor = (e: typeof p0, i: number) => e && ('team_color' in e ? (e as { team_color: string }).team_color : (e as Profile).avatar_color) || (i === 0 ? '#3b82f6' : '#ef4444');

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1">
        {[0, 1].map(idx => (
          <button
            key={idx}
            onClick={() => !isSpectator && (match.status === 'active' || isAdmin) && addPoint(idx as 0 | 1)}
            className={`flex-1 flex flex-col items-center justify-center gap-3 transition-colors active:opacity-80
              ${isSpectator ? '' : 'cursor-pointer'}`}
            style={{ backgroundColor: `${getColor(idx === 0 ? p0 : p1, idx)}15` }}
            disabled={isSpectator}
          >
            <div className="font-black text-8xl font-mono" style={{ color: getColor(idx === 0 ? p0 : p1, idx) }}>
              {state.scores[idx]}
            </div>
            <p className="font-bold text-charcoal-200 text-lg">{getName(idx === 0 ? p0 : p1)}</p>
            <div className="flex gap-1">
              {Array(state.sets[idx]).fill(0).map((_, i) => (
                <div key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: getColor(idx === 0 ? p0 : p1, idx) }} />
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="text-center py-2 bg-charcoal-800 border-t border-charcoal-700 text-charcoal-400 text-xs">
        Sets: {state.sets[0]} — {state.sets[1]} · Tap court side to add point
      </div>
    </div>
  );
}
