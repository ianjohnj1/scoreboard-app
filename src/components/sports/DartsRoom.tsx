import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { recordEvent, undoLastEvent } from '../../lib/matches';
import Avatar from '../Avatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile } from '../../lib/supabase';

type DartsState = {
  scores: Record<string, number>; // profileId -> remaining score
  turns: Array<{ profileId: string; darts: number[]; bust?: boolean }>;
  currentPlayerIdx: number;
  currentDarts: number[];
  winner: string | null;
};

export default function DartsRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, isSpectator, currentUser } = ctx;

  const startScore = (match.house_rules as Record<string, unknown>)?.start_score as number ?? 501;
  const doubleOut = (match.house_rules as Record<string, unknown>)?.double_out as boolean ?? true;

  const matchPlayers = players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];

  const [state, setState] = useState<DartsState>(() => {
    const s: Record<string, number> = {};
    matchPlayers.forEach(p => { s[p.id] = startScore; });
    return {
      scores: s,
      turns: [],
      currentPlayerIdx: 0,
      currentDarts: [],
      winner: null,
    };
  });
  const [inputScore, setInputScore] = useState('');
  const [loading, setLoading] = useState(false);

  const currentPlayer = matchPlayers[state.currentPlayerIdx];

  const addDart = async (score: number) => {
    if (!currentPlayer || state.winner || loading) return;
    const newDarts = [...state.currentDarts, score];
    const remaining = state.scores[currentPlayer.id] - score;

    if (remaining < 0 || remaining === 1) {
      // Bust
      setState(s => ({
        ...s,
        currentDarts: [],
        turns: [...s.turns, { profileId: currentPlayer.id, darts: newDarts, bust: true }],
        currentPlayerIdx: (s.currentPlayerIdx + 1) % matchPlayers.length,
      }));
      await recordEvent(match.id, 'darts_bust', { darts: newDarts }, currentPlayer.id, undefined, currentUser?.id);
      return;
    }

    if (remaining === 0) {
      // Win!
      setState(s => ({
        ...s,
        scores: { ...s.scores, [currentPlayer.id]: 0 },
        winner: currentPlayer.id,
        currentDarts: [],
        turns: [...s.turns, { profileId: currentPlayer.id, darts: newDarts }],
      }));
      await recordEvent(match.id, 'darts_win', { darts: newDarts, score }, currentPlayer.id, undefined, currentUser?.id);
      return;
    }

    const updatedDarts = newDarts;
    if (updatedDarts.length >= 3) {
      // End of turn
      setState(s => ({
        ...s,
        scores: { ...s.scores, [currentPlayer.id]: remaining },
        currentDarts: [],
        turns: [...s.turns, { profileId: currentPlayer.id, darts: updatedDarts }],
        currentPlayerIdx: (s.currentPlayerIdx + 1) % matchPlayers.length,
      }));
      await recordEvent(match.id, 'darts_turn', { darts: updatedDarts, remaining }, currentPlayer.id, undefined, currentUser?.id);
    } else {
      setState(s => ({
        ...s,
        scores: { ...s.scores, [currentPlayer.id]: remaining },
        currentDarts: updatedDarts,
      }));
    }
  };

  const QUICK_SCORES = [20, 19, 18, 17, 16, 15, 25, 50, 0];

  return (
    <div className="flex flex-col h-full">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 py-3">
        <div className="flex justify-around">
          {matchPlayers.map((p, i) => (
            <div key={p.id} className={`text-center px-4 py-2 rounded-xl ${state.currentPlayerIdx === i && !state.winner ? 'bg-accent-700/30 border border-accent-600/50' : ''}`}>
              <Avatar name={p.display_name} color={p.avatar_color} size="sm" className="mx-auto mb-1" />
              <p className="text-charcoal-200 text-xs font-semibold truncate">{p.display_name}</p>
              <p className={`font-mono font-black text-3xl ${state.scores[p.id] === 0 ? 'text-success-400' : 'text-charcoal-50'}`}>
                {state.scores[p.id] ?? startScore}
              </p>
            </div>
          ))}
        </div>
        {state.winner && (
          <div className="mt-2 text-center text-success-400 font-bold text-lg animate-bounce-subtle">
            🎯 {profiles.get(state.winner)?.display_name} WINS!
          </div>
        )}
      </div>

      {/* Turn history */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1 text-xs">
        {state.turns.slice(-10).reverse().map((turn, i) => {
          const p = profiles.get(turn.profileId);
          return (
            <div key={i} className={`flex items-center gap-2 py-1.5 px-2 rounded-lg ${turn.bust ? 'bg-danger-900/20' : 'bg-charcoal-800/50'}`}>
              <Avatar name={p?.display_name || '?'} color={p?.avatar_color} size="xs" />
              <span className="text-charcoal-300 font-medium flex-1">{p?.display_name}</span>
              {turn.bust ? (
                <span className="text-danger-400 font-bold">BUST</span>
              ) : (
                <div className="flex gap-1">
                  {turn.darts.map((d, j) => (
                    <span key={j} className="font-mono bg-charcoal-700 px-1.5 py-0.5 rounded">{d}</span>
                  ))}
                  <span className="text-charcoal-400 ml-1">= {turn.darts.reduce((s, d) => s + d, 0)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      {!isSpectator && match.status === 'active' && !state.winner && (
        <div className="border-t border-charcoal-700 bg-charcoal-800 p-3 safe-bottom">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1">
              {state.currentDarts.map((d, i) => (
                <span key={i} className="font-mono font-bold bg-accent-700/50 px-3 py-1.5 rounded-lg text-accent-200">{d}</span>
              ))}
              {Array(3 - state.currentDarts.length).fill(0).map((_, i) => (
                <span key={i} className="font-mono bg-charcoal-700 border border-dashed border-charcoal-600 px-3 py-1.5 rounded-lg text-charcoal-600">-</span>
              ))}
            </div>
            <span className="text-charcoal-400 text-sm font-mono">
              -{state.currentDarts.reduce((s, d) => s + d, 0)}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 mb-2">
            {QUICK_SCORES.map(s => (
              <button
                key={s}
                onClick={() => addDart(s)}
                className={`score-btn font-mono text-sm ${s === 50 ? 'text-success-400' : s === 25 ? 'text-warning-400' : ''}`}
              >
                {s === 25 ? 'Bull' : s === 50 ? 'D-Bull' : s || 'Miss'}
              </button>
            ))}
            {/* Custom input */}
            <div className="col-span-1 flex">
              <input
                type="number"
                value={inputScore}
                onChange={e => setInputScore(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { addDart(Number(inputScore)); setInputScore(''); } }}
                className="input-field text-center font-mono text-sm py-2"
                placeholder="n"
                min={0} max={60}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
