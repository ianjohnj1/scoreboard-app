import { supabase, SAFE_PROFILE_COLUMNS, type Profile } from './supabase';

export const SEASON_POINT_RULES = {
  placement: [
    { rank: 1, label: '1st Place', points: 100 },
    { rank: 2, label: '2nd Place', points: 50 },
    { rank: 3, label: '3rd Place', points: 25 },
    { rank: 4, label: 'Match Completion', points: 10 }
  ],
  milestones: {
    cricket: [
      { label: '50+ Runs Scored', points: 50 },
      { label: '3+ Wickets Taken', points: 30 }
    ],
    golf: [
      { label: 'Hole-in-One / Chip Off Ace', points: 50 }
    ]
  }
};

export function calculatePlacementSP(rank: number): number {
  if (rank === 1) return SEASON_POINT_RULES.placement[0].points;
  if (rank === 2) return SEASON_POINT_RULES.placement[1].points;
  if (rank === 3) return SEASON_POINT_RULES.placement[2].points;
  return SEASON_POINT_RULES.placement[3].points;
}

interface ChipOffScoreEventData { points?: number }
interface GolfScoreEventData { strokes?: number; holeInOne?: boolean }

// One row of the leaderboard_match_player_scores view: a single match's
// contribution for a single roster player, already reduced from match_events
// by Postgres. The view emits a row per roster player even when they recorded
// nothing, so these are never undefined.
//
// This replaced a ~30-field in-memory accumulator. The dropped fields
// (darts_thrown, busts, checkouts, double_out_finishes, atw_*, killer_*,
// wins, frames, sets, balls, total_putt_attempts, clutch_putts, total_chips,
// scoring_chips) were recomputed on every leaderboard load and read by nothing
// - the only consumer, LeaderboardPage, never touched extra_stats. Per-player
// analytics of that kind come from the player_career_analytics view instead.
export interface MatchPlayerScoreRow {
  match_id: string;
  profile_id: string;
  team_id: string | null;
  points: number;
  runs: number;
  wickets: number;
  strokes: number;
  hio: number;
  tens: number;
  holed_putts_total: number;
}

type SafeProfile = Omit<Profile, 'pin_hash'>;

export interface GlobalPlayerStats {
  id: string;
  profile_id: string;
  sport: string;
  profile: SafeProfile | undefined;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  total_score: number;
  best_score: number | null;
  best_score_classic: number | null;
  best_score_chip_off: number | null;
  pvp_career_holes: number;
  season_points: number;
  cricket_lifetime_runs: number;
  cricket_lifetime_wickets: number;
  golf_lifetime_points: number;
  golf_lifetime_hio: number;
}

interface MatchStatsListEntry {
  profile_id: string;
  team_id: string | null;
  score: number;
  is_winner: boolean;
  extra: MatchPlayerScoreRow;
}

// Some sports never get an explicit winner from their room's own scoring UI -
// classic golf has no win-condition button at all, and any match can be ended
// early via the generic "End & Lock" header action before its room's own win
// condition fires. This backfills winner_profile_id from raw scores when it's
// still missing at completion time. There's no career-stats cache to touch
// any more - player_career_stats was dropped 2026-07-30 (dead table, see
// supabase/migrations/20260730030956_drop_dead_player_career_stats_table.sql).
export async function determineAndSaveWinnerIfMissing(matchId: string): Promise<void> {
  const { data: match, error: matchError } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchError || !match) throw matchError || new Error('Match not found');
  if (match.is_practice) return;
  if (match.winner_profile_id || match.winner_team_id) return;
  if (match.sport !== 'golf') return;

  const houseRules = match.house_rules as { variant?: string; team_play?: boolean } | null;
  const isChipOff = houseRules?.variant === 'chip_off';
  const isPuttVsPutt = houseRules?.variant === 'putt_vs_putt';
  if (isPuttVsPutt) return; // PvP always completes with an explicit team winner

  const { data: players, error: playersError } = await supabase
    .from('match_players')
    .select('profile_id, team_id')
    .eq('match_id', matchId);

  if (playersError) throw playersError;

  let winnerProfileId: string | null = null;

  if (isChipOff) {
    const { data: events } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .eq('is_undone', false);

    const playerMap = new Map<string, { points: number; tens: number }>();
    players.forEach(p => playerMap.set(p.profile_id, { points: 0, tens: 0 }));

    events?.forEach(e => {
      if (!e.player_id || e.event_type !== 'chip_off_score') return;
      const existing = playerMap.get(e.player_id) || { points: 0, tens: 0 };
      const pts = (e.event_data as ChipOffScoreEventData).points || 0;
      existing.points += pts;
      if (pts === 10) existing.tens += 1;
      playerMap.set(e.player_id, existing);
    });

    if (houseRules?.team_play) {
      // Team chip-off: aggregate the same per-player points/tens by team_id
      // and set winner_team_id instead - there's no single winning profile.
      const teamMap = new Map<string, { points: number; tens: number }>();
      players.forEach(p => {
        if (!p.team_id) return;
        const existing = teamMap.get(p.team_id) || { points: 0, tens: 0 };
        const pStats = playerMap.get(p.profile_id) || { points: 0, tens: 0 };
        existing.points += pStats.points;
        existing.tens += pStats.tens;
        teamMap.set(p.team_id, existing);
      });

      let winnerTeamId: string | null = null;
      let maxTeamPoints = -1;
      let maxTeamTens = -1;
      teamMap.forEach((val, tid) => {
        if (val.points > maxTeamPoints || (val.points === maxTeamPoints && val.tens > maxTeamTens)) {
          maxTeamPoints = val.points;
          maxTeamTens = val.tens;
          winnerTeamId = tid;
        }
      });

      if (winnerTeamId) {
        await supabase.from('match_rooms').update({ winner_team_id: winnerTeamId }).eq('id', matchId);
      }
      return;
    }

    let maxPoints = -1;
    let maxTens = -1;
    playerMap.forEach((val, pid) => {
      if (val.points > maxPoints) {
        maxPoints = val.points;
        maxTens = val.tens;
        winnerProfileId = pid;
      } else if (val.points === maxPoints && val.tens > maxTens) {
        maxTens = val.tens;
        winnerProfileId = pid;
      }
    });
  } else {
    const { data: golfScores } = await supabase
      .from('golf_scores')
      .select('*')
      .eq('match_id', matchId);

    const playerMap = new Map<string, { strokes: number }>();
    players.forEach(p => playerMap.set(p.profile_id, { strokes: 0 }));

    if (golfScores && golfScores.length > 0) {
      golfScores.forEach(s => {
        const existing = playerMap.get(s.profile_id) || { strokes: 0 };
        playerMap.set(s.profile_id, { strokes: existing.strokes + (s.strokes || 0) });
      });
    } else {
      // Fallback to match_events for classic golf
      const { data: events } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .eq('is_undone', false);

      events?.forEach(e => {
        if (e.event_type === 'golf_score' && e.player_id) {
          const existing = playerMap.get(e.player_id) || { strokes: 0 };
          existing.strokes += (e.event_data as GolfScoreEventData).strokes || 0;
          playerMap.set(e.player_id, existing);
        }
      });
    }

    let minStrokes = Infinity;
    playerMap.forEach((val, pid) => {
      if (val.strokes > 0 && val.strokes < minStrokes) {
        minStrokes = val.strokes;
        winnerProfileId = pid;
      }
    });
  }

  if (winnerProfileId) {
    await supabase.from('match_rooms').update({ winner_profile_id: winnerProfileId }).eq('id', matchId);
  }
}

// Bucket every child row by its match_id in one pass. The per-match loop in
// getGlobalLeaderboardData() used to re-scan the full players/events/cricket
// arrays with a .filter() per match, which is O(matches x rows) - at ~163
// events per match that's ~59M comparisons by 600 completed matches and ~163M
// by 1000, i.e. seconds of blocked main thread on a phone. Grouping up front
// makes the loop linear in total rows instead.
export function groupByMatchId<T extends { match_id: string }>(rows: T[] | null): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows || []) {
    const bucket = grouped.get(row.match_id);
    if (bucket) {
      bucket.push(row);
    } else {
      grouped.set(row.match_id, [row]);
    }
  }
  return grouped;
}

export async function getGlobalLeaderboardData(): Promise<GlobalPlayerStats[]> {
  // 1. Fetch all completed matches. Only the columns the placement/season-point
  // logic below actually reads - this used to be select('*'), which dragged
  // custom_config, room_code and timestamps across the wire for every match.
  const { data: matches, error: matchesError } = await supabase
    .from('match_rooms')
    .select('id, sport, house_rules, winner_profile_id, winner_team_id')
    .eq('status', 'completed')
    .eq('is_practice', false);

  if (matchesError) throw matchesError;
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map(m => m.id);

  // 2. Per-player scores come pre-reduced from Postgres now. The view collapses
  // every match_event into one row per (match, roster player), so this pulls
  // ~5 rows per match instead of the ~163 raw events it used to - see
  // supabase/migrations/20260730143009_leaderboard_match_player_scores_view.sql.
  // match_players and cricket_player_stats aren't fetched at all any more:
  // the view already emits a row per roster player (zeros included) and folds
  // cricket's side table in behind the same columns.
  const [{ data: scores, error: scoresError }, { data: profiles }] = await Promise.all([
    supabase.from('leaderboard_match_player_scores').select('*').in('match_id', matchIds),
    supabase.from('profiles').select(SAFE_PROFILE_COLUMNS)
  ]);

  if (scoresError) throw scoresError;

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const scoresByMatch = groupByMatchId(scores as MatchPlayerScoreRow[] | null);
  const globalStats = new Map<string, GlobalPlayerStats>();

  // Helper to get/init global player stats
  const getPlayerStats = (profileId: string, sport: string) => {
    const key = `${profileId}:${sport}`;
    if (!globalStats.has(key)) {
      globalStats.set(key, {
        id: key,
        profile_id: profileId,
        sport,
        profile: profileMap.get(profileId),
        matches_played: 0,
        matches_won: 0,
        matches_lost: 0,
        total_score: 0,
        best_score: null,
        best_score_classic: null,
        best_score_chip_off: null,
        pvp_career_holes: 0,
        season_points: 0,
        cricket_lifetime_runs: 0,
        cricket_lifetime_wickets: 0,
        golf_lifetime_points: 0,
        golf_lifetime_hio: 0
      });
    }
    return globalStats.get(key)!;
  };

  // 3. Process each match
  for (const match of matches) {
    // The grouped array itself, not a per-match copy - read only, never mutate
    // it in place. One row per roster player, already reduced by the view.
    const matchScores = scoresByMatch.get(match.id) || [];
    const isChipOff = match.sport === 'golf' && (match.house_rules as { variant?: string })?.variant === 'chip_off';
    const isPuttVsPutt = match.sport === 'golf' && (match.house_rules as { variant?: string })?.variant === 'putt_vs_putt';
    const isChipOffTeamPlay = isChipOff && Boolean((match.house_rules as { team_play?: boolean })?.team_play);

    // 3.1 Aggregate this match's stats
    const matchStatsList: MatchStatsListEntry[] = [];
    matchScores.forEach(s => {
      const isWinner = match.winner_profile_id === s.profile_id || (!!s.team_id && match.winner_team_id === s.team_id);
      let score = s.points;
      if (match.sport === 'cricket') score = s.runs;
      if (match.sport === 'golf') {
        if (isChipOff) {
          // Team chip-off: every teammate is credited with the team's combined
          // total for ranking/placement/lifetime points, same as how a team
          // win/loss is already shared - individual milestone stats (tens)
          // stay untouched below, sourced from that player's own row.
          if (isChipOffTeamPlay && s.team_id) {
            score = matchScores
              .filter(mate => mate.team_id === s.team_id)
              .reduce((sum, mate) => sum + mate.points, 0);
          } else {
            score = s.points;
          }
        } else if (isPuttVsPutt) {
          score = s.holed_putts_total;
        } else {
          score = s.strokes;
        }
      }

      matchStatsList.push({
        profile_id: s.profile_id,
        team_id: s.team_id ?? null,
        score,
        is_winner: isWinner,
        extra: s
      });
    });

    // 3.2 Determine placement points
    const sortedForPlacement = [...matchStatsList].sort((a, b) => {
      if (match.sport === 'golf' && !isChipOff && !isPuttVsPutt) return a.score - b.score; // Lower strokes is better for classic
      return b.score - a.score;
    });

    // Team chip-off gives every teammate an identical score (the team total),
    // but sortedForPlacement.findIndex below is a raw array position, not a
    // tie-aware rank - two entries with equal score would still land on
    // different positions/ranks. Rank by each team's position in the score
    // order instead, so both teammates always share one rank/placement SP.
    const chipOffTeamOrder: string[] = [];
    if (isChipOffTeamPlay) {
      sortedForPlacement.forEach(s => {
        if (s.team_id && !chipOffTeamOrder.includes(s.team_id)) chipOffTeamOrder.push(s.team_id);
      });
    }

    // 3.3 Update global stats
    matchStatsList.forEach(ms => {
      const g = getPlayerStats(ms.profile_id, match.sport);

      // Calculate Season Points
      const rank = isChipOffTeamPlay && ms.team_id
        ? chipOffTeamOrder.indexOf(ms.team_id) + 1
        : sortedForPlacement.findIndex(s => s.profile_id === ms.profile_id) + 1;
      const placementSP = calculatePlacementSP(rank);

      let milestoneSP = 0;
      if (match.sport === 'cricket') {
        if (ms.score >= 50) milestoneSP += SEASON_POINT_RULES.milestones.cricket[0].points;
        if (ms.extra.wickets >= 3) milestoneSP += SEASON_POINT_RULES.milestones.cricket[1].points;
      } else if (match.sport === 'golf' && !isPuttVsPutt) {
        const totalAces = ms.extra.hio + ms.extra.tens;
        milestoneSP += totalAces * SEASON_POINT_RULES.milestones.golf[0].points;
      }

      g.matches_played += 1;
      g.matches_won += ms.is_winner ? 1 : 0;
      g.matches_lost += ms.is_winner ? 0 : 1;
      g.total_score += ms.score;
      g.season_points += (placementSP + milestoneSP);

      // Lifetime counters
      if (match.sport === 'cricket') {
        g.cricket_lifetime_runs += ms.score;
        g.cricket_lifetime_wickets += ms.extra.wickets;
      } else if (match.sport === 'golf') {
        if (isChipOff) {
          g.golf_lifetime_points += ms.score;
          g.golf_lifetime_hio += ms.extra.tens;
        } else if (isPuttVsPutt) {
          g.pvp_career_holes += ms.extra.holed_putts_total;
        } else {
          g.golf_lifetime_hio += ms.extra.hio;
        }
      }
      
      // Update best score
      if (g.best_score === null) {
        g.best_score = ms.score;
      } else {
        if (match.sport === 'golf' && !isChipOff && !isPuttVsPutt) {
          if (ms.score > 0) g.best_score = Math.min(g.best_score, ms.score);
        } else {
          g.best_score = Math.max(g.best_score, ms.score);
        }
      }

      // Update specific golf best scores
      if (match.sport === 'golf') {
        if (isChipOff) {
          if (g.best_score_chip_off === null) {
            g.best_score_chip_off = ms.score;
          } else {
            g.best_score_chip_off = Math.max(g.best_score_chip_off, ms.score);
          }
        } else if (!isPuttVsPutt) {
          if (g.best_score_classic === null) {
            if (ms.score > 0) g.best_score_classic = ms.score;
          } else {
            if (ms.score > 0) g.best_score_classic = Math.min(g.best_score_classic, ms.score);
          }
        }
      }
    });
  }

  return Array.from(globalStats.values());
}
