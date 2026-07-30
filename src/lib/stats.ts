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

interface DartsThrowData {
  scoredPoints?: number;
  ring?: string;
  segment?: string;
}

type DartsDartEntry = number | DartsThrowData;

interface DartsScoreEventData {
  throw?: DartsThrowData;
  darts?: DartsDartEntry[];
}

function getDartsEventScore(eventData: DartsScoreEventData) {
  if (eventData?.throw && typeof eventData.throw.scoredPoints === 'number') {
    return eventData.throw.scoredPoints;
  }

  if (Array.isArray(eventData?.darts)) {
    return eventData.darts.reduce((sum: number, dart: DartsDartEntry) => {
      if (typeof dart === 'number') return sum + dart;
      return sum + (dart?.scoredPoints || 0);
    }, 0);
  }

  return 0;
}

function getDartsEventThrowCount(eventData: DartsScoreEventData) {
  if (eventData?.throw) return 1;
  if (Array.isArray(eventData?.darts)) return eventData.darts.length;
  return 0;
}

interface MatchEventRow {
  event_type: string;
  player_id: string | null;
  team_id: string | null;
  event_data: unknown;
}

interface PlayerStatAccumulator {
  points: number;
  tens: number;
  wins: number;
  frames: number;
  sets: number;
  runs: number;
  wickets: number;
  balls: number;
  strokes: number;
  hio: number;
  darts_thrown?: number;
  busts?: number;
  checkouts?: number;
  double_out_finishes?: number;
  atw_attempts?: number;
  atw_successful_hits?: number;
  atw_advances?: number;
  atw_bull_finishes?: number;
  killer_attempts?: number;
  killer_activations?: number;
  killer_opponent_lives_removed?: number;
  killer_self_penalties?: number;
  killer_eliminations_secured?: number;
  killer_times_eliminated?: number;
  killer_target_hit_attempts?: number;
  killer_target_hit_successes?: number;
  holed_putts_total?: number;
  total_putt_attempts?: number;
  clutch_putts?: number;
  total_chips?: number;
  scoring_chips?: number;
}

function newPlayerStatAccumulator(): PlayerStatAccumulator {
  return {
    points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
    runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0
  };
}

interface ChipOffScoreEventData { points?: number }
interface DartsWinEventData extends DartsScoreEventData { checkout?: boolean }
interface DartsAtwEventData extends DartsScoreEventData {
  advanced_by?: number;
  hit_target?: boolean;
  winner_profile_id?: string;
}
interface DartsKillerEventData extends DartsScoreEventData {
  eliminated_player_ids?: string[];
  activated?: boolean;
  hit_opponent_id?: string;
  self_penalty?: boolean;
}
interface BballScoreEventData { pts?: number }
interface CardsRoundEventData { round?: Record<string, number> }
interface CustomScoreEventData { value?: number }
interface DeliveryEventData { runs?: number; extra?: string }
interface WicketEventData { dismissedBy?: string }
interface GolfScoreEventData { strokes?: number; holeInOne?: boolean }
interface PointEventData { amount?: number }
interface PlayerTeamRoutingEventData { player?: number; team?: number }
interface PuttAttemptEventData { outcome?: string }

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
  chip_off_total_chips: number;
  chip_off_scoring_chips: number;
  extra_stats: PlayerStatAccumulator;
}

interface MatchStatsListEntry {
  profile_id: string;
  team_id: string | null;
  score: number;
  is_winner: boolean;
  extra: PlayerStatAccumulator;
}

// Some sports never get an explicit winner from their room's own scoring UI -
// classic golf has no win-condition button at all, and any match can be ended
// early via the generic "End & Lock" header action before its room's own win
// condition fires. This backfills winner_profile_id from raw scores when it's
// still missing at completion time. It deliberately does NOT touch
// player_career_stats - that table is no longer written from the client (see
// docs/rls-ground-rules.md and CLAUDE.md's Known gaps history).
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

export async function getGlobalLeaderboardData(): Promise<GlobalPlayerStats[]> {
  // 1. Fetch all completed matches
  const { data: matches, error: matchesError } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('status', 'completed')
    .eq('is_practice', false);

  if (matchesError) throw matchesError;
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map(m => m.id);

  // 2. Fetch all players and events for these matches
  const [{ data: players }, { data: events }, { data: profiles }, { data: cricketStats }] = await Promise.all([
    supabase.from('match_players').select('*').in('match_id', matchIds),
    supabase.from('match_events').select('*').in('match_id', matchIds).eq('is_undone', false),
    supabase.from('profiles').select(SAFE_PROFILE_COLUMNS),
    supabase.from('cricket_player_stats').select('*').in('match_id', matchIds)
  ]);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
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
        golf_lifetime_hio: 0,
        chip_off_total_chips: 0,
        chip_off_scoring_chips: 0,
        extra_stats: newPlayerStatAccumulator()
      });
    }
    return globalStats.get(key)!;
  };

  // 3. Process each match
  for (const match of matches) {
    const matchPlayers = players?.filter(p => p.match_id === match.id) || [];
    const matchEvents = events?.filter(e => e.match_id === match.id) || [];
    const isChipOff = match.sport === 'golf' && (match.house_rules as { variant?: string })?.variant === 'chip_off';
    const isPuttVsPutt = match.sport === 'golf' && (match.house_rules as { variant?: string })?.variant === 'putt_vs_putt';
    const isChipOffTeamPlay = isChipOff && Boolean((match.house_rules as { team_play?: boolean })?.team_play);

    const playerMap = new Map<string, PlayerStatAccumulator>();

    if (match.sport === 'cricket') {
      const matchCricketStats = cricketStats?.filter(s => s.match_id === match.id) || [];
      matchCricketStats.forEach(s => {
        const existing = playerMap.get(s.profile_id) || newPlayerStatAccumulator();
        existing.runs += s.bat_runs || 0;
        existing.balls += s.bat_balls || 0;
        existing.wickets += s.bowl_wickets || 0;
        playerMap.set(s.profile_id, existing);
      });
    } else {
      function updateLocalPlayerStats(pid: string, e: MatchEventRow) {
        const existing = playerMap.get(pid) || newPlayerStatAccumulator();

        switch (e.event_type) {
          case 'chip_off_score': {
            const pts = ((e.event_data as ChipOffScoreEventData).points) || 0;
            existing.points += pts;
            if (pts === 10) existing.tens += 1;
            break;
          }
          case 'darts_turn':
          case 'darts_bust':
          case 'darts_throw': {
            const data = e.event_data as DartsScoreEventData;
            existing.points += getDartsEventScore(data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(data);
            if (e.event_type === 'darts_bust') existing.busts = (existing.busts || 0) + 1;
            break;
          }
          case 'darts_win': {
            const data = e.event_data as DartsWinEventData;
            existing.wins += 1;
            existing.points += getDartsEventScore(data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(data);
            existing.checkouts = (existing.checkouts || 0) + (data.checkout ? 1 : 0);
            existing.double_out_finishes = (existing.double_out_finishes || 0) + ((data.throw?.ring === 'double' || data.throw?.ring === 'double_bull') ? 1 : 0);
            break;
          }
          case 'darts_atw_throw': {
            const data = e.event_data as DartsAtwEventData;
            existing.points += data.advanced_by || 0;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(data);
            existing.atw_attempts = (existing.atw_attempts || 0) + 1;
            existing.atw_successful_hits = (existing.atw_successful_hits || 0) + (data.hit_target ? 1 : 0);
            existing.atw_advances = (existing.atw_advances || 0) + (data.advanced_by || 0);
            existing.atw_bull_finishes = (existing.atw_bull_finishes || 0) + ((data.winner_profile_id === pid) ? 1 : 0);
            break;
          }
          case 'darts_killer_throw': {
            const data = e.event_data as DartsKillerEventData;
            existing.points += (data.eliminated_player_ids?.length || 0) * 10;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(data);
            existing.killer_attempts = (existing.killer_attempts || 0) + 1;
            existing.killer_activations = (existing.killer_activations || 0) + (data.activated ? 1 : 0);
            existing.killer_opponent_lives_removed = (existing.killer_opponent_lives_removed || 0) + (data.hit_opponent_id ? 1 : 0);
            existing.killer_self_penalties = (existing.killer_self_penalties || 0) + (data.self_penalty ? 1 : 0);
            existing.killer_eliminations_secured = (existing.killer_eliminations_secured || 0) + (data.eliminated_player_ids?.filter((candidateId: string) => candidateId !== pid).length || 0);
            existing.killer_times_eliminated = (existing.killer_times_eliminated || 0) + ((data.eliminated_player_ids || []).includes(pid) ? 1 : 0);
            existing.killer_target_hit_attempts = (existing.killer_target_hit_attempts || 0) + (data.throw?.segment && data.throw?.segment !== 'miss' ? 1 : 0);
            existing.killer_target_hit_successes = (existing.killer_target_hit_successes || 0) + ((data.activated || Boolean(data.hit_opponent_id) || data.self_penalty) ? 1 : 0);
            break;
          }
          case 'tt_point':
            existing.points += 1;
            break;
          case 'tt_set':
            existing.sets += 1;
            break;
          case 'pool_frame':
            existing.frames += 1;
            break;
          case 'bball_score':
            existing.points += (e.event_data as BballScoreEventData).pts || 0;
            break;
          case 'cards_round': {
            const roundScores = (e.event_data as CardsRoundEventData).round || {};
            if (roundScores[pid] !== undefined) {
              existing.points += roundScores[pid];
            }
            break;
          }
          case 'custom_score':
            existing.points += (e.event_data as CustomScoreEventData).value || 0;
            break;
          case 'delivery': {
            const data = e.event_data as DeliveryEventData;
            existing.runs += data.runs || 0;
            const extra = data.extra;
            if (!extra || extra === 'bye' || extra === 'legbye') {
              existing.balls += 1;
            }
            break;
          }
          case 'wicket': {
            const dismissedBy = (e.event_data as WicketEventData).dismissedBy;
            if (dismissedBy) {
              const bowlerPid = dismissedBy;
              const bStats = playerMap.get(bowlerPid) || newPlayerStatAccumulator();
              bStats.wickets += 1;
              playerMap.set(bowlerPid, bStats);
            }
            break;
          }
          case 'golf_score': {
            const data = e.event_data as GolfScoreEventData;
            existing.strokes += data.strokes || 0;
            if (data.holeInOne) existing.hio += 1;
            break;
          }
          case 'putt_attempt': {
            const outcome = (e.event_data as PuttAttemptEventData).outcome;
            existing.total_putt_attempts = (existing.total_putt_attempts || 0) + 1;
            if (outcome === 'holed') {
              existing.holed_putts_total = (existing.holed_putts_total || 0) + 1;
            }
            break;
          }
          case 'tiebreak_result':
            existing.clutch_putts = (existing.clutch_putts || 0) + 1;
            break;
          case 'point':
          case 'score':
            existing.points += (e.event_data as PointEventData).amount || 1;
            break;
        }
        playerMap.set(pid, existing);
      }

      matchEvents.forEach(e => {
        let pid = e.player_id;
        const routingData = e.event_data as PlayerTeamRoutingEventData;
        if (!pid && routingData?.player !== undefined) {
          pid = matchPlayers[routingData.player]?.profile_id;
        }
        if (!pid && e.team_id) {
          matchPlayers.filter(p => p.team_id === e.team_id).forEach(tp => updateLocalPlayerStats(tp.profile_id, e));
          return;
        }
        if (pid) updateLocalPlayerStats(pid, e);
      });
    }

    // 3.1 Aggregate this match's stats
    const matchStatsList: MatchStatsListEntry[] = [];
    matchPlayers.forEach(p => {
      const s = playerMap.get(p.profile_id) || newPlayerStatAccumulator();

      const isWinner = match.winner_profile_id === p.profile_id || (!!p.team_id && match.winner_team_id === p.team_id);
      let score = s.points;
      if (match.sport === 'cricket') score = s.runs;
      if (match.sport === 'golf') {
        if (isChipOff) {
          // Team chip-off: every teammate is credited with the team's combined
          // total for ranking/placement/lifetime points, same as how a team
          // win/loss is already shared - individual milestone stats (tens,
          // chips) stay untouched below, sourced from the per-player accumulator.
          if (isChipOffTeamPlay && p.team_id) {
            const teammateIds = matchPlayers.filter(mp => mp.team_id === p.team_id).map(mp => mp.profile_id);
            score = teammateIds.reduce((sum, pid) => sum + (playerMap.get(pid)?.points || 0), 0);
          } else {
            score = s.points;
          }
        } else if (isPuttVsPutt) {
          score = s.holed_putts_total || 0;
        } else {
          score = s.strokes;
        }
      }

      matchStatsList.push({
        profile_id: p.profile_id,
        team_id: p.team_id ?? null,
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
        if ((ms.extra.wickets || 0) >= 3) milestoneSP += SEASON_POINT_RULES.milestones.cricket[1].points;
      } else if (match.sport === 'golf' && !isPuttVsPutt) {
        const totalAces = (ms.extra.hio || 0) + (ms.extra.tens || 0);
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
        g.cricket_lifetime_wickets += (ms.extra.wickets || 0);
      } else if (match.sport === 'golf') {
        if (isChipOff) {
          g.golf_lifetime_points += ms.score;
          g.golf_lifetime_hio += (ms.extra.tens || 0);
          g.chip_off_total_chips += (ms.extra.total_chips || 0);
          g.chip_off_scoring_chips += (ms.extra.scoring_chips || 0);
        } else if (isPuttVsPutt) {
          g.pvp_career_holes += (ms.extra.holed_putts_total || 0);
        } else {
          g.golf_lifetime_hio += (ms.extra.hio || 0);
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

      // Merge extra stats
      const msExtra = ms.extra as unknown as Record<string, number>;
      const gExtra = g.extra_stats as unknown as Record<string, number>;
      Object.keys(msExtra).forEach(key => {
        if (typeof msExtra[key] === 'number') {
          gExtra[key] = (gExtra[key] || 0) + msExtra[key];
        } else {
          gExtra[key] = msExtra[key];
        }
      });
    });
  }

  return Array.from(globalStats.values());
}
