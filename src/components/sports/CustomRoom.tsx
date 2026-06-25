import React, { useState } from 'react';
import { recordEvent } from '../../lib/matches';
import Avatar from '../Avatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile } from '../../lib/supabase';

type CustomConfig = {
  win_condition: 'highest' | 'lowest';
  scoring_buttons: Array<{ label: string; value: number }>;
};

export default function CustomRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, players, profiles, isSpectator, currentUser } = ctx;
  const config = (match.custom_config || {}) as Partial<CustomConfig>;
  const buttons = config.scoring_buttons || [{ label: '+1', value: 1 }];
  const winCondition = config.win_condition || 'highest';
  const isTeamMatch = teams.length >= 2;

  const matchPlayers = players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];

  const entities = isTeamMatch
    ? teams.map(t => ({
        id: t.id,
        name: t.team_name,
        color: t.team_color || '#3b82f6',
      }))
    : matchPlayers.map(p => ({
        id: p.id,
        name: p.display_name,
        color: p.avatar_color,
      }));

  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    entities.forEach(e => { s[e.id] = 0; });
    return s;
  });

  const addScore = async (entityId: string, value: number) => {
    const newScore = (scores[entityId] || 0) + value;
    setScores(s => ({ ...s, [entityId]: newScore }));
    await recordEvent(match.id, 'custom_score', { entityId, value, newScore }, undefined, isTeamMatch ? entityId : undefined, currentUser?.id);
  };

  const sortedEntities = [...entities].sort((a, b) =>
    winCondition === 'highest'
      ? (scores[b.id] || 0) - (scores[a.id] || 0)
      : (scores[a.id] || 0) - (scores[b.id] || 0)
  );

  const leader = sortedEntities[0];

  return (
    <div className="flex flex-col h-full">
      <div className="bg-charcoal-800 border-b border-charcoal-700 px-4 py-4 space-y-3">
        {sortedEntities.map((entity, rank) => (
          <div key={entity.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
            rank === 0 ? 'border-warning-500/30 bg-warning-500/5' : 'border-charcoal-700'
          }`}>
            <span className="text-charcoal-500 font-mono font-bold w-5">{rank + 1}</span>
            {!isTeamMatch && (() => {
              const p = profiles.get(entity.id);
              return p ? <Avatar name={p.display_name} color={p.avatar_color} size="sm" /> : null;
            })()}
            <div className="flex-1">
              <p className="text-charcoal-100 font-semibold">{entity.name}</p>
            </div>
            <div className="font-black font-mono text-3xl" style={{ color: entity.color }}>
              {scores[entity.id] || 0}
            </div>
          </div>
        ))}
      </div>

      {!isSpectator && match.status === 'active' && (
        <div className="flex-1 p-4 space-y-4">
          {entities.map(entity => (
            <div key={entity.id} className="card p-3">
              <p className="text-charcoal-300 font-semibold text-sm mb-2 flex items-center gap-2">
                <span className="font-mono font-black text-xl" style={{ color: entity.color }}>{scores[entity.id] || 0}</span>
                {entity.name}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {buttons.map((btn, i) => (
                  <button
                    key={i}
                    onClick={() => addScore(entity.id, btn.value)}
                    className={`score-btn py-3 text-sm font-bold ${
                      btn.value < 0 ? 'text-danger-400 border-danger-700/40' :
                      btn.value > 0 ? 'text-success-400 border-success-700/40' : ''
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isSpectator && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-charcoal-500 text-sm">{winCondition === 'highest' ? 'Highest score wins' : 'Lowest score wins'}</p>
        </div>
      )}
    </div>
  );
}
