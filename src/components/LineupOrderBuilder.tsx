import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import Avatar from './Avatar';
import type { Profile } from '../lib/supabase';

type LineupOrderBuilderProps = {
  title: string;
  players: Profile[];
  onChange: (players: Profile[]) => void;
  accentColor: string;
};

export default function LineupOrderBuilder({
  title,
  players,
  onChange,
  accentColor,
}: LineupOrderBuilderProps) {
  const movePlayer = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= players.length) return;

    const next = [...players];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    onChange(next);
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical size={16} style={{ color: accentColor }} />
        <h3 className="font-bold text-charcoal-100">{title}</h3>
      </div>
      <p className="text-xs text-charcoal-400">
        Set the order this team cycles through during PvP turns.
      </p>

      <div className="space-y-2">
        {players.map((player, index) => (
          <div
            key={player.id}
            className="flex items-center gap-3 rounded-xl border border-charcoal-700 bg-charcoal-900/50 px-3 py-2"
          >
            <span className="w-6 text-center text-xs font-black text-charcoal-500">{index + 1}</span>
            <Avatar name={player.display_name} color={player.avatar_color} size="sm" />
            <span className="flex-1 text-sm font-medium text-charcoal-100">{player.display_name}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => movePlayer(index, -1)}
                disabled={index === 0}
                className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-1.5 text-charcoal-300 disabled:opacity-40"
                aria-label={`Move ${player.display_name} up`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => movePlayer(index, 1)}
                disabled={index === players.length - 1}
                className="rounded-lg border border-charcoal-700 bg-charcoal-800 p-1.5 text-charcoal-300 disabled:opacity-40"
                aria-label={`Move ${player.display_name} down`}
              >
                <ArrowDown size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
