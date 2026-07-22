import { useMemo, useState } from 'react';
import UserAvatar from './UserAvatar';
import type { MatchTeam, Profile } from '../lib/supabase';

type TieBreakerChallengeProps = {
  teams: MatchTeam[];
  teamPlayers: Map<string, Profile[]>;
  onCancel: () => void;
  onConfirm: (result: { winningTeamId: string; winningPlayerId: string }) => Promise<void> | void;
  loading?: boolean;
};

export default function TieBreakerChallenge({
  teams,
  teamPlayers,
  onCancel,
  onConfirm,
  loading = false,
}: TieBreakerChallengeProps) {
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, string>>({});
  const [distances, setDistances] = useState<Record<string, [string, string]>>({});
  const [error, setError] = useState('');

  const averages = useMemo(() => {
    const output: Record<string, number | null> = {};

    teams.forEach(team => {
      const teamDistances = distances[team.id] || ['', ''];
      const first = Number(teamDistances[0]);
      const second = Number(teamDistances[1]);

      if (Number.isFinite(first) && Number.isFinite(second) && teamDistances[0] !== '' && teamDistances[1] !== '') {
        output[team.id] = (first + second) / 2;
      } else {
        output[team.id] = null;
      }
    });

    return output;
  }, [distances, teams]);

  const handleSubmit = async () => {
    if (teams.length !== 2) return;

    const [teamA, teamB] = teams;
    const playerA = selectedPlayers[teamA.id];
    const playerB = selectedPlayers[teamB.id];
    const avgA = averages[teamA.id];
    const avgB = averages[teamB.id];

    if (!playerA || !playerB || avgA === null || avgB === null) {
      setError('Choose a representative for each team and enter both distance values.');
      return;
    }

    if (avgA === avgB) {
      setError('Tie-break averages are still level. Re-enter the challenge with a clear winner.');
      return;
    }

    const winningTeamId = avgA < avgB ? teamA.id : teamB.id;
    const winningPlayerId = avgA < avgB ? playerA : playerB;
    setError('');
    await onConfirm({ winningTeamId, winningPlayerId });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-charcoal-700 bg-charcoal-900/40 p-3">
        <p className="text-sm text-charcoal-300">
          Each team chooses one representative. Enter both putt distances using the same real-world unit for all four attempts.
        </p>
      </div>

      {teams.map(team => {
        const teamRoster = teamPlayers.get(team.id) || [];
        const teamDistances = distances[team.id] || ['', ''];
        const average = averages[team.id];

        return (
          <div key={team.id} className="rounded-2xl border border-charcoal-700 bg-charcoal-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-charcoal-100" style={{ color: team.team_color }}>
                {team.team_name}
              </h3>
              <span className="text-xs uppercase tracking-widest text-charcoal-500">Putt Off</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {teamRoster.map(player => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPlayers(prev => ({ ...prev, [team.id]: player.id }))}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    selectedPlayers[team.id] === player.id
                      ? 'border-success-500/40 bg-success-500/10'
                      : 'border-charcoal-700 bg-charcoal-800/50 hover:bg-charcoal-800'
                  }`}
                >
                  <UserAvatar
                    display_name={player.display_name}
                    avatar_color={player.avatar_color}
                    avatar_url={player.avatar_url}
                    size="sm"
                  />
                  <span className="text-sm font-medium text-charcoal-100">{player.display_name}</span>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map(index => (
                <label key={index} className="space-y-1">
                  <span className="text-[11px] uppercase tracking-wider text-charcoal-500">
                    Putt {index + 1}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={teamDistances[index]}
                    onChange={e => {
                      const next: [string, string] = [...teamDistances] as [string, string];
                      next[index] = e.target.value;
                      setDistances(prev => ({ ...prev, [team.id]: next }));
                    }}
                    className="input-field"
                    placeholder="Distance"
                  />
                </label>
              ))}
            </div>

            <div className="rounded-xl border border-charcoal-700 bg-charcoal-800/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-charcoal-500">Average Distance</p>
              <p className="text-lg font-black text-charcoal-100">
                {average === null ? '--' : average.toFixed(2)}
              </p>
            </div>
          </div>
        );
      })}

      {error && (
        <div className="rounded-xl border border-danger-500/40 bg-danger-500/10 px-3 py-2 text-sm text-danger-300">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="button" onClick={handleSubmit} disabled={loading} className="btn-success flex-1">
          {loading ? 'Saving...' : 'Confirm Winner'}
        </button>
      </div>
    </div>
  );
}
