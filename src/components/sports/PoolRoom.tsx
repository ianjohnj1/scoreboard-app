import React, { useState } from 'react';
import { recordEvent } from '../../lib/matches';
import type { MatchContext } from '../../pages/MatchRoomPage';

export default function PoolRoom({ ctx }: { ctx: MatchContext }) {
  const { match, teams, isSpectator, currentUser } = ctx;
  const [frames, setFrames] = useState<[number, number]>([0, 0]);
  const t0 = teams[0]?.team_name || 'Player 1';
  const t1 = teams[1]?.team_name || 'Player 2';

  const addFrame = async (idx: 0 | 1) => {
    const newF: [number, number] = [...frames] as [number, number];
    newF[idx]++;
    setFrames(newF);
    await recordEvent(match.id, 'pool_frame', { winner: idx, frames: newF }, undefined, teams[idx]?.id, currentUser?.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1">
        {[0, 1].map(idx => (
          <button
            key={idx}
            onClick={() => !isSpectator && match.status === 'active' && addFrame(idx as 0 | 1)}
            className={`flex-1 flex flex-col items-center justify-center gap-2 transition-all active:opacity-80
              ${idx === 0 ? 'bg-accent-900/20' : 'bg-danger-900/20'}`}
            disabled={isSpectator}
          >
            <div className={`font-black text-8xl font-mono ${idx === 0 ? 'text-accent-400' : 'text-danger-400'}`}>
              {frames[idx]}
            </div>
            <p className="font-bold text-charcoal-200 text-lg">{idx === 0 ? t0 : t1}</p>
            <p className="text-charcoal-500 text-sm">Frames</p>
          </button>
        ))}
      </div>
      <p className="text-center py-2 bg-charcoal-800 border-t border-charcoal-700 text-charcoal-400 text-xs">
        Tap to award frame · 8-Ball Pool
      </p>
    </div>
  );
}
