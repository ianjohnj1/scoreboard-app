import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { recordEvent } from '../../lib/matches';
import Avatar from '../Avatar';
import type { MatchContext } from '../../pages/MatchRoomPage';
import type { Profile } from '../../lib/supabase';

export default function CardsRoom({ ctx }: { ctx: MatchContext }) {
  const { match, players, profiles, isSpectator, currentUser } = ctx;
  const matchPlayers = players.map(p => profiles.get(p.profile_id)).filter(Boolean) as Profile[];
  const [rounds, setRounds] = useState<Record<string, number>[]>([]);
  const [tempRound, setTempRound] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const totals = matchPlayers.reduce<Record<string, number>>((acc, p) => {
    acc[p.id] = rounds.reduce((s, r) => s + (r[p.id] || 0), 0);
    return acc;
  }, {});

  const addRound = async () => {
    const round: Record<string, number> = {};
    matchPlayers.forEach(p => { round[p.id] = parseInt(tempRound[p.id] || '0'); });
    setRounds(r => [...r, round]);
    await recordEvent(match.id, 'cards_round', { round }, undefined, undefined, currentUser?.id);
    setTempRound({});
    setAdding(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-charcoal-800">
            <tr>
              <th className="text-left px-3 py-2 text-charcoal-400">Rnd</th>
              {matchPlayers.map(p => (
                <th key={p.id} className="px-2 py-2 text-charcoal-200 font-semibold text-center">
                  {p.display_name.split(' ')[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((r, i) => (
              <tr key={i} className={`border-t border-charcoal-800 ${i % 2 === 0 ? 'bg-charcoal-900/30' : ''}`}>
                <td className="px-3 py-2 text-charcoal-500 font-mono">{i + 1}</td>
                {matchPlayers.map(p => (
                  <td key={p.id} className="px-2 py-2 text-center font-mono text-charcoal-200">{r[p.id] ?? 0}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 border-charcoal-600 bg-charcoal-800">
              <td className="px-3 py-2 text-charcoal-300 font-bold">Total</td>
              {matchPlayers.map(p => (
                <td key={p.id} className="px-2 py-2 text-center font-mono font-bold text-charcoal-100">{totals[p.id]}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {!isSpectator && match.status === 'active' && (
        <div className="border-t border-charcoal-700 bg-charcoal-800 p-3 safe-bottom">
          {adding ? (
            <div className="space-y-2">
              {matchPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  <Avatar name={p.display_name} color={p.avatar_color} size="xs" />
                  <span className="text-charcoal-200 text-sm flex-1">{p.display_name}</span>
                  <input
                    type="number"
                    value={tempRound[p.id] || ''}
                    onChange={e => setTempRound(r => ({ ...r, [p.id]: e.target.value }))}
                    className="input-field w-20 text-center py-2"
                    placeholder="0"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => setAdding(false)} className="btn-secondary flex-1 py-2 text-sm">Cancel</button>
                <button onClick={addRound} className="btn-primary flex-1 py-2 text-sm">Add Round</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Add Round
            </button>
          )}
        </div>
      )}
    </div>
  );
}
