import { supabase, SAFE_PROFILE_COLUMNS } from './supabase';

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

export interface MatchStats {
  profile_id: string;
  sport: string;
  is_winner: boolean;
  score: number;
  extra_stats: Record<string, any>;
  best_sport?: string;
}

function getDartsEventScore(eventData: Record<string, any>) {
  if (eventData?.throw && typeof eventData.throw.scoredPoints === 'number') {
    return eventData.throw.scoredPoints;
  }

  if (Array.isArray(eventData?.darts)) {
    return eventData.darts.reduce((sum: number, dart: any) => {
      if (typeof dart === 'number') return sum + dart;
      return sum + (dart?.scoredPoints || 0);
    }, 0);
  }

  return 0;
}

function getDartsEventThrowCount(eventData: Record<string, any>) {
  if (eventData?.throw) return 1;
  if (Array.isArray(eventData?.darts)) return eventData.darts.length;
  return 0;
}

export async function aggregateMatchStats(matchId: string): Promise<MatchStats[]> {
  const { data: match, error: matchError } = await supabase
    .from('match_rooms')
    .select('*')
    .eq('id', matchId)
    .single();

  if (matchError || !match) throw matchError || new Error('Match not found');

  const { data: players, error: playersError } = await supabase
    .from('match_players')
    .select('profile_id, team_id')
    .eq('match_id', matchId);

  if (playersError) throw playersError;

  const { data: teams, error: teamsError } = await supabase
    .from('match_teams')
    .select('*')
    .eq('match_id', matchId)
    .order('sort_order');

  if (teamsError) throw teamsError;

  const stats: MatchStats[] = [];

  const isChipOff = match.sport === 'golf' && (match.house_rules as any)?.variant === 'chip_off';
  const isPuttVsPutt = match.sport === 'golf' && (match.house_rules as any)?.variant === 'putt_vs_putt';

  let calculatedWinnerProfileId = match.winner_profile_id;
  let calculatedWinnerTeamId = match.winner_team_id;

   switch (match.sport) {
    case 'cricket': {
      const { data: cricketStats } = await supabase
        .from('cricket_player_stats')
        .select('*')
        .eq('match_id', matchId);

      const playerMap = new Map<string, any>();
      // Initialize with all players
      players.forEach(p => playerMap.set(p.profile_id, { runs: 0, wickets: 0, balls: 0 }));
      
      if (cricketStats && cricketStats.length > 0) {
        cricketStats.forEach(s => {
          const existing = playerMap.get(s.profile_id) || { runs: 0, wickets: 0, balls: 0 };
          playerMap.set(s.profile_id, {
            runs: existing.runs + (s.bat_runs || 0),
            wickets: existing.wickets + (s.bowl_wickets || 0),
            balls: existing.balls + (s.bat_balls || 0),
          });
        });
      } else {
        // Fallback to match_events for cricket
        const { data: events } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .eq('is_undone', false);

        events?.forEach(e => {
          let pid = e.player_id;
          
          if (e.event_type === 'delivery' && pid) {
            const existing = playerMap.get(pid) || { runs: 0, wickets: 0, balls: 0 };
            existing.runs += e.event_data.runs || 0;
            const extra = e.event_data.extra;
            if (!extra || extra === 'bye' || extra === 'legbye') {
              existing.balls += 1;
            }
            playerMap.set(pid, existing);
          } else if (e.event_type === 'wicket') {
            // Dismissed batter
            if (pid) {
              const batterStats = playerMap.get(pid) || { runs: 0, wickets: 0, balls: 0 };
              // We could track outs here if needed
              playerMap.set(pid, batterStats);
            }
            
            // Bowler gets the wicket
            if (e.event_data.dismissedBy) {
              const bowlerPid = e.event_data.dismissedBy;
              const bStats = playerMap.get(bowlerPid) || { runs: 0, wickets: 0, balls: 0 };
              bStats.wickets += 1;
              playerMap.set(bowlerPid, bStats);
            }
          }
        });
      }

      players.forEach(p => {
        const s = playerMap.get(p.profile_id);
        if (!s && match.sport === 'cricket') return; // Only skip if no stats for cricket
        
        const finalStats = s || { runs: 0, wickets: 0, balls: 0 };
        stats.push({
          profile_id: p.profile_id,
          sport: 'cricket',
          is_winner: calculatedWinnerProfileId === p.profile_id || (!!p.team_id && calculatedWinnerTeamId === p.team_id),
          score: finalStats.runs,
          extra_stats: { runs: finalStats.runs, wickets: finalStats.wickets, balls: finalStats.balls }
        });
      });
      break;
    }

    case 'golf': {
      if (isChipOff) {
        const { data: events } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .eq('is_undone', false);

        const playerMap = new Map<string, any>();
        // Initialize map with all players at 0
        players.forEach(p => playerMap.set(p.profile_id, { points: 0, tens: 0 }));

        events?.forEach(e => {
          if (!e.player_id || e.event_type !== 'chip_off_score') return;
          const existing = playerMap.get(e.player_id) || { points: 0, tens: 0, total_chips: 0, scoring_chips: 0 };
          const pts = (e.event_data.points as number) || 0;
          existing.points += pts;
          existing.total_chips += 1;
          if (pts === 10) existing.tens += 1;
          if ([2, 5, 10].includes(pts)) existing.scoring_chips += 1;
          playerMap.set(e.player_id, existing);
        });

        // Determine winner if not set
        if (!calculatedWinnerProfileId) {
          let maxPoints = -1;
          let maxTens = -1;
          playerMap.forEach((val, pid) => {
            if (val.points > maxPoints) {
              maxPoints = val.points;
              maxTens = val.tens;
              calculatedWinnerProfileId = pid;
            } else if (val.points === maxPoints && val.tens > maxTens) {
              maxTens = val.tens;
              calculatedWinnerProfileId = pid;
            }
          });
        }

        players.forEach(p => {
          const s = playerMap.get(p.profile_id) || { points: 0, tens: 0, total_chips: 0, scoring_chips: 0 };
          
          stats.push({
            profile_id: p.profile_id,
            sport: 'chip_off',
            is_winner: calculatedWinnerProfileId === p.profile_id,
            score: s.points,
            extra_stats: s
          });
        });
      } else if (isPuttVsPutt) {
        const { data: events } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .eq('is_undone', false);

        const playerMap = new Map<string, any>();
        players.forEach(p => playerMap.set(p.profile_id, {
          holed_putts_total: 0,
          total_putt_attempts: 0,
          clutch_putts: 0,
        }));

        events?.forEach(e => {
          if (e.event_type === 'putt_attempt' && e.player_id) {
            const existing = playerMap.get(e.player_id) || {
              holed_putts_total: 0,
              total_putt_attempts: 0,
              clutch_putts: 0,
            };
            existing.total_putt_attempts += 1;
            if (e.event_data.outcome === 'holed') existing.holed_putts_total += 1;
            playerMap.set(e.player_id, existing);
          }

          if (e.event_type === 'tiebreak_result' && e.player_id) {
            const existing = playerMap.get(e.player_id) || {
              holed_putts_total: 0,
              total_putt_attempts: 0,
              clutch_putts: 0,
            };
            existing.clutch_putts += 1;
            playerMap.set(e.player_id, existing);
          }
        });

        players.forEach(p => {
          const s = playerMap.get(p.profile_id) || {
            holed_putts_total: 0,
            total_putt_attempts: 0,
            clutch_putts: 0,
          };

          stats.push({
            profile_id: p.profile_id,
            sport: 'putt_vs_putt',
            is_winner: !!p.team_id && calculatedWinnerTeamId === p.team_id,
            score: s.holed_putts_total,
            extra_stats: {
              ...s,
              career_pct_holed: s.total_putt_attempts > 0 ? (s.holed_putts_total / s.total_putt_attempts) * 100 : 0,
            }
          });
        });
      } else {
        const { data: golfScores } = await supabase
          .from('golf_scores')
          .select('*')
          .eq('match_id', matchId);

        const playerMap = new Map<string, any>();
        // Initialize with all players
        players.forEach(p => playerMap.set(p.profile_id, { strokes: 0, hio: 0 }));
        
        if (golfScores && golfScores.length > 0) {
          golfScores?.forEach(s => {
            const existing = playerMap.get(s.profile_id) || { strokes: 0, hio: 0 };
            playerMap.set(s.profile_id, {
              strokes: existing.strokes + (s.strokes || 0),
              hio: existing.hio + (s.is_hole_in_one ? 1 : 0),
            });
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
              const existing = playerMap.get(e.player_id) || { strokes: 0, hio: 0 };
              existing.strokes += e.event_data.strokes || 0;
              if (e.event_data.holeInOne) existing.hio += 1;
              playerMap.set(e.player_id, existing);
            }
          });
        }

        // Determine winner if not set
        if (!calculatedWinnerProfileId) {
          let minStrokes = Infinity;
          playerMap.forEach((val, pid) => {
            if (val.strokes > 0 && val.strokes < minStrokes) {
              minStrokes = val.strokes;
              calculatedWinnerProfileId = pid;
            }
          });
        }

        players.forEach(p => {
          const s = playerMap.get(p.profile_id) || { strokes: 0, hio: 0 };
          if (s.strokes === 0 && !isChipOff) return; // Skip if no strokes in classic golf

          stats.push({
            profile_id: p.profile_id,
            sport: 'golf',
            is_winner: calculatedWinnerProfileId === p.profile_id,
            score: s.strokes,
            extra_stats: { strokes: s.strokes, hio: s.hio }
          });
        });
      }
      break;
    }

    default: {
      // Handle Chip Off or generic points via match_events
      const { data: events } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', matchId)
        .eq('is_undone', false);

      const playerMap = new Map<string, any>();
      
      function updatePlayerStats(pid: string, e: any) {
        const existing = playerMap.get(pid) || { 
          points: 0, 
          tens: 0, 
          wins: 0, 
          frames: 0, 
          sets: 0,
          runs: 0,
          wickets: 0,
          balls: 0,
          strokes: 0,
          hio: 0
        };
        
        switch (e.event_type) {
          case 'chip_off_score':
            const pts = (e.event_data.points as number) || 0;
            existing.points += pts;
            if (pts === 10) existing.tens += 1;
            break;
          case 'darts_turn':
          case 'darts_bust':
          case 'darts_throw':
            existing.points += getDartsEventScore(e.event_data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            if (e.event_type === 'darts_bust') existing.busts = (existing.busts || 0) + 1;
            break;
          case 'darts_win':
            existing.wins += 1;
            existing.points += getDartsEventScore(e.event_data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.checkouts = (existing.checkouts || 0) + ((e.event_data.checkout as boolean) ? 1 : 0);
            existing.double_out_finishes = (existing.double_out_finishes || 0) + ((e.event_data.throw?.ring === 'double' || e.event_data.throw?.ring === 'double_bull') ? 1 : 0);
            break;
          case 'darts_atw_throw':
            existing.points += (e.event_data.advanced_by as number) || 0;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.atw_attempts = (existing.atw_attempts || 0) + 1;
            existing.atw_successful_hits = (existing.atw_successful_hits || 0) + ((e.event_data.hit_target as boolean) ? 1 : 0);
            existing.atw_advances = (existing.atw_advances || 0) + ((e.event_data.advanced_by as number) || 0);
            existing.atw_bull_finishes = (existing.atw_bull_finishes || 0) + ((e.event_data.winner_profile_id === pid) ? 1 : 0);
            break;
          case 'darts_killer_throw':
            existing.points += ((e.event_data.eliminated_player_ids as string[] | undefined)?.length || 0) * 10;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.killer_attempts = (existing.killer_attempts || 0) + 1;
            existing.killer_activations = (existing.killer_activations || 0) + ((e.event_data.activated as boolean) ? 1 : 0);
            existing.killer_opponent_lives_removed = (existing.killer_opponent_lives_removed || 0) + (e.event_data.hit_opponent_id ? 1 : 0);
            existing.killer_self_penalties = (existing.killer_self_penalties || 0) + ((e.event_data.self_penalty as boolean) ? 1 : 0);
            existing.killer_eliminations_secured = (existing.killer_eliminations_secured || 0) + ((e.event_data.eliminated_player_ids as string[] | undefined)?.filter((candidateId: string) => candidateId !== pid).length || 0);
            existing.killer_times_eliminated = (existing.killer_times_eliminated || 0) + (((e.event_data.eliminated_player_ids as string[] | undefined) || []).includes(pid) ? 1 : 0);
            existing.killer_target_hit_attempts = (existing.killer_target_hit_attempts || 0) + (e.event_data.throw?.segment && e.event_data.throw?.segment !== 'miss' ? 1 : 0);
            existing.killer_target_hit_successes = (existing.killer_target_hit_successes || 0) + (((e.event_data.activated as boolean) || Boolean(e.event_data.hit_opponent_id) || (e.event_data.self_penalty as boolean)) ? 1 : 0);
            break;
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
            existing.points += (e.event_data.pts as number) || 0;
            break;
          case 'cards_round':
            const roundScores = (e.event_data.round as Record<string, number>) || {};
            if (roundScores[pid] !== undefined) {
              existing.points += roundScores[pid];
            }
            break;
          case 'custom_score':
            existing.points += (e.event_data.value as number) || 0;
            break;
          case 'delivery':
            existing.runs += e.event_data.runs || 0;
            const extra = e.event_data.extra;
            if (!extra || extra === 'bye' || extra === 'legbye') {
              existing.balls += 1;
            }
            break;
          case 'wicket':
            // If there's a bowler (dismissedBy), they get a wicket.
            if (e.event_data.dismissedBy) {
              const bowlerPid = e.event_data.dismissedBy;
              const bowlerStats = playerMap.get(bowlerPid) || { 
                points: 0, tens: 0, wins: 0, frames: 0, sets: 0, 
                runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
              };
              bowlerStats.wickets = (bowlerStats.wickets || 0) + 1;
              playerMap.set(bowlerPid, bowlerStats);
            }
            break;
          case 'golf_score':
            existing.strokes += e.event_data.strokes || 0;
            if (e.event_data.holeInOne) existing.hio += 1;
            break;
          case 'point':
          case 'score':
            existing.points += (e.event_data.amount as number) || 1;
            break;
        }
        
        playerMap.set(pid, existing);
      }

      events?.forEach(e => {
        // Find player_id for this event (might be in event_data for team sports)
        let pid = e.player_id;
        
        // Handle team-based events or events where player_id might be missing
        if (!pid && e.event_data?.player !== undefined) {
          // Table Tennis or generic player index
          const playerIdx = e.event_data.player as number;
          pid = players[playerIdx]?.profile_id;
        }

        if (!pid && e.team_id) {
          // Attribute to all players in the team if no specific player is identified
          const teamPlayers = players.filter(p => p.team_id === e.team_id);
          teamPlayers.forEach(tp => {
            updatePlayerStats(tp.profile_id, e);
          });
          return;
        }

        if (!pid && e.event_data?.team !== undefined) {
          // Basketball or generic team index, for events recorded without a team_id column
          const teamIdx = e.event_data.team as number;
          const teamId = teams && teams[teamIdx]?.id;
          if (teamId) {
            // Attribute to all players in that team for career stats
            const teamPlayers = players.filter(p => p.team_id === teamId);
            teamPlayers.forEach(tp => {
              updatePlayerStats(tp.profile_id, e);
            });
            return;
          }
        }

        if (pid) {
          updatePlayerStats(pid, e);
        }
      });

      players.forEach(p => {
        const s = playerMap.get(p.profile_id) || { 
          points: 0, tens: 0, wins: 0, frames: 0, sets: 0, 
          runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
        };
        
        // Determine primary score based on sport
        let score = s.points;
        if (match.sport === 'cricket') score = s.runs;
        if (match.sport === 'golf') score = s.strokes;

        stats.push({
          profile_id: p.profile_id,
          sport: match.sport,
          is_winner: match.winner_profile_id === p.profile_id || (!!p.team_id && match.winner_team_id === p.team_id),
          score: score,
          extra_stats: s
        });
      });
      break;
    }
  }

  // Save calculated winners back to match room if they were missing
  if (!match.winner_profile_id && calculatedWinnerProfileId) {
    await supabase.from('match_rooms').update({ 
      winner_profile_id: calculatedWinnerProfileId,
      winner_team_id: calculatedWinnerTeamId
    }).eq('id', matchId);
  }

  return stats;
}

export async function updateCareerStats(matchId: string, retries = 3): Promise<void> {
  // 0. Check if it's a practice match
  const { data: match } = await supabase
    .from('match_rooms')
    .select('is_practice')
    .eq('id', matchId)
    .single();
  
  if (match?.is_practice) {
    console.log(`Match ${matchId} is a practice match. Skipping career stats update.`);
    return;
  }

  let matchStats: MatchStats[] = [];
  let lastError: any = null;

  // Retry logic for the aggregation process
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      matchStats = await aggregateMatchStats(matchId);
      break; // Success!
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt} to aggregate stats for match ${matchId} failed:`, err);
      if (attempt < retries) {
        // Wait before retrying (exponential backoff: 500ms, 1000ms, 2000ms)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 500));
      }
    }
  }

  if (matchStats.length === 0 && lastError) {
    console.error(`All ${retries} attempts to aggregate stats for match ${matchId} failed.`, lastError);
    throw lastError;
  }

  // Sort match stats to determine placement points
  const sortedStats = [...matchStats].sort((a, b) => {
    // For golf (classic), lower strokes is better
    if (a.sport === 'golf') return a.score - b.score;
    // For chip_off and other sports, higher score is better
    return b.score - a.score;
  });

  // Process the stats
  const errors: any[] = [];
  for (const stat of matchStats) {
    try {
      // 1. Calculate Placement Points
      const rank = sortedStats.findIndex(s => s.profile_id === stat.profile_id) + 1;
      const placementSP = calculatePlacementSP(rank);

      // 2. Calculate Milestones
      let milestoneSP = 0;
      if (stat.sport === 'chip_off') {
        const hioCount = (stat.extra_stats.tens as number) || 0;
        milestoneSP += hioCount * SEASON_POINT_RULES.milestones.golf[0].points;
      } else if (stat.sport === 'cricket') {
        if (stat.score >= 50) milestoneSP += SEASON_POINT_RULES.milestones.cricket[0].points;
        if ((stat.extra_stats.wickets as number) >= 3) milestoneSP += SEASON_POINT_RULES.milestones.cricket[1].points;
      } else if (stat.sport === 'golf') {
        const hioCount = (stat.extra_stats.hio as number) || 0;
        milestoneSP += hioCount * SEASON_POINT_RULES.milestones.golf[0].points;
      }

      const totalSP = placementSP + milestoneSP;

      // Get existing career stats
      const { data: existing } = await supabase
        .from('player_career_stats')
        .select('*')
        .eq('profile_id', stat.profile_id)
        .eq('sport', stat.sport)
        .maybeSingle();

      if (existing) {
        // Merge extra_stats
        const newExtra = { ...existing.extra_stats };
        Object.keys(stat.extra_stats).forEach(key => {
          if (typeof stat.extra_stats[key] === 'number') {
            newExtra[key] = (newExtra[key] || 0) + stat.extra_stats[key];
          } else {
            newExtra[key] = stat.extra_stats[key];
          }
        });

        await supabase
          .from('player_career_stats')
          .update({
            matches_played: (existing.matches_played || 0) + 1,
            matches_won: (existing.matches_won || 0) + (stat.is_winner ? 1 : 0),
            matches_lost: (existing.matches_lost || 0) + (stat.is_winner ? 0 : 1),
            total_score: (existing.total_score || 0) + stat.score,
            best_score: existing.best_score === null ? stat.score : 
                        (stat.sport === 'golf' 
                          ? (stat.score > 0 ? Math.min(existing.best_score, stat.score) : existing.best_score)
                          : Math.max(existing.best_score, stat.score)),
            season_points: (existing.season_points || 0) + totalSP,
            cricket_lifetime_runs: (existing.cricket_lifetime_runs || 0) + (stat.sport === 'cricket' ? stat.score : 0),
            cricket_lifetime_wickets: (existing.cricket_lifetime_wickets || 0) + (stat.sport === 'cricket' ? (stat.extra_stats.wickets || 0) : 0),
            golf_lifetime_points: (existing.golf_lifetime_points || 0) + (stat.sport === 'chip_off' ? stat.score : 0),
            golf_lifetime_hio: (existing.golf_lifetime_hio || 0) + (stat.sport === 'golf' || stat.sport === 'chip_off' ? (stat.extra_stats.hio || stat.extra_stats.tens || 0) : 0),
            extra_stats: newExtra,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('player_career_stats')
          .insert({
            profile_id: stat.profile_id,
            sport: stat.sport,
            matches_played: 1,
            matches_won: stat.is_winner ? 1 : 0,
            matches_lost: stat.is_winner ? 0 : 1,
            total_score: stat.score,
            best_score: stat.score,
            season_points: totalSP,
            cricket_lifetime_runs: stat.sport === 'cricket' ? stat.score : 0,
            cricket_lifetime_wickets: stat.sport === 'cricket' ? (stat.extra_stats.wickets || 0) : 0,
            golf_lifetime_points: stat.sport === 'chip_off' ? stat.score : 0,
            golf_lifetime_hio: stat.sport === 'golf' || stat.sport === 'chip_off' ? (stat.extra_stats.hio || stat.extra_stats.tens || 0) : 0,
            extra_stats: stat.extra_stats,
          });
      }
    } catch (err) {
      console.error(`Failed to update career stats for profile ${stat.profile_id}:`, err);
      errors.push(err);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Completed with ${errors.length} errors during career stats update.`);
  }
}

export async function getGlobalLeaderboardData(): Promise<any[]> {
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
  const globalStats = new Map<string, any>();

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
        extra_stats: {
          points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
          runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0
        }
      });
    }
    return globalStats.get(key);
  };

  // 3. Process each match
  for (const match of matches) {
    const matchPlayers = players?.filter(p => p.match_id === match.id) || [];
    const matchEvents = events?.filter(e => e.match_id === match.id) || [];
    const isChipOff = match.sport === 'golf' && (match.house_rules as any)?.variant === 'chip_off';
    const isPuttVsPutt = match.sport === 'golf' && (match.house_rules as any)?.variant === 'putt_vs_putt';
    
    const playerMap = new Map<string, any>();

    if (match.sport === 'cricket') {
      const matchCricketStats = cricketStats?.filter(s => s.match_id === match.id) || [];
      matchCricketStats.forEach(s => {
        const existing = playerMap.get(s.profile_id) || { 
          points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
          runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
        };
        existing.runs += s.bat_runs || 0;
        existing.balls += s.bat_balls || 0;
        existing.wickets += s.bowl_wickets || 0;
        playerMap.set(s.profile_id, existing);
      });
    } else {
      function updateLocalPlayerStats(pid: string, e: any) {
        const existing = playerMap.get(pid) || { 
          points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
          runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
        };
        
        switch (e.event_type) {
          case 'chip_off_score':
            const pts = (e.event_data.points as number) || 0;
            existing.points += pts;
            if (pts === 10) existing.tens += 1;
            break;
          case 'darts_turn':
          case 'darts_bust':
          case 'darts_throw':
            existing.points += getDartsEventScore(e.event_data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            if (e.event_type === 'darts_bust') existing.busts = (existing.busts || 0) + 1;
            break;
          case 'darts_win':
            existing.wins += 1;
            existing.points += getDartsEventScore(e.event_data);
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.checkouts = (existing.checkouts || 0) + ((e.event_data.checkout as boolean) ? 1 : 0);
            existing.double_out_finishes = (existing.double_out_finishes || 0) + ((e.event_data.throw?.ring === 'double' || e.event_data.throw?.ring === 'double_bull') ? 1 : 0);
            break;
          case 'darts_atw_throw':
            existing.points += (e.event_data.advanced_by as number) || 0;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.atw_attempts = (existing.atw_attempts || 0) + 1;
            existing.atw_successful_hits = (existing.atw_successful_hits || 0) + ((e.event_data.hit_target as boolean) ? 1 : 0);
            existing.atw_advances = (existing.atw_advances || 0) + ((e.event_data.advanced_by as number) || 0);
            existing.atw_bull_finishes = (existing.atw_bull_finishes || 0) + ((e.event_data.winner_profile_id === pid) ? 1 : 0);
            break;
          case 'darts_killer_throw':
            existing.points += ((e.event_data.eliminated_player_ids as string[] | undefined)?.length || 0) * 10;
            existing.darts_thrown = (existing.darts_thrown || 0) + getDartsEventThrowCount(e.event_data);
            existing.killer_attempts = (existing.killer_attempts || 0) + 1;
            existing.killer_activations = (existing.killer_activations || 0) + ((e.event_data.activated as boolean) ? 1 : 0);
            existing.killer_opponent_lives_removed = (existing.killer_opponent_lives_removed || 0) + (e.event_data.hit_opponent_id ? 1 : 0);
            existing.killer_self_penalties = (existing.killer_self_penalties || 0) + ((e.event_data.self_penalty as boolean) ? 1 : 0);
            existing.killer_eliminations_secured = (existing.killer_eliminations_secured || 0) + ((e.event_data.eliminated_player_ids as string[] | undefined)?.filter((candidateId: string) => candidateId !== pid).length || 0);
            existing.killer_times_eliminated = (existing.killer_times_eliminated || 0) + (((e.event_data.eliminated_player_ids as string[] | undefined) || []).includes(pid) ? 1 : 0);
            existing.killer_target_hit_attempts = (existing.killer_target_hit_attempts || 0) + (e.event_data.throw?.segment && e.event_data.throw?.segment !== 'miss' ? 1 : 0);
            existing.killer_target_hit_successes = (existing.killer_target_hit_successes || 0) + (((e.event_data.activated as boolean) || Boolean(e.event_data.hit_opponent_id) || (e.event_data.self_penalty as boolean)) ? 1 : 0);
            break;
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
            existing.points += (e.event_data.pts as number) || 0;
            break;
          case 'cards_round':
            const roundScores = (e.event_data.round as Record<string, number>) || {};
            if (roundScores[pid] !== undefined) {
              existing.points += roundScores[pid];
            }
            break;
          case 'custom_score':
            existing.points += (e.event_data.value as number) || 0;
            break;
          case 'delivery':
            existing.runs += e.event_data.runs || 0;
            const extra = e.event_data.extra;
            if (!extra || extra === 'bye' || extra === 'legbye') {
              existing.balls += 1;
            }
            break;
          case 'wicket':
            if (e.event_data.dismissedBy) {
              const bowlerPid = e.event_data.dismissedBy;
              const bStats = playerMap.get(bowlerPid) || { 
                points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
                runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
              };
              bStats.wickets += 1;
              playerMap.set(bowlerPid, bStats);
            }
            break;
          case 'golf_score':
            existing.strokes += e.event_data.strokes || 0;
            if (e.event_data.holeInOne) existing.hio += 1;
            break;
          case 'putt_attempt':
            existing.total_putt_attempts = (existing.total_putt_attempts || 0) + 1;
            if (e.event_data.outcome === 'holed') {
              existing.holed_putts_total = (existing.holed_putts_total || 0) + 1;
            }
            break;
          case 'tiebreak_result':
            existing.clutch_putts = (existing.clutch_putts || 0) + 1;
            break;
          case 'point':
          case 'score':
            existing.points += (e.event_data.amount as number) || 1;
            break;
        }
        playerMap.set(pid, existing);
      }

      matchEvents.forEach(e => {
        let pid = e.player_id;
        if (!pid && e.event_data?.player !== undefined) {
          pid = matchPlayers[e.event_data.player as number]?.profile_id;
        }
        if (!pid && e.team_id) {
          matchPlayers.filter(p => p.team_id === e.team_id).forEach(tp => updateLocalPlayerStats(tp.profile_id, e));
          return;
        }
        if (pid) updateLocalPlayerStats(pid, e);
      });
    }

    // 3.1 Aggregate this match's stats
    const matchStatsList: any[] = [];
    matchPlayers.forEach(p => {
      const s = playerMap.get(p.profile_id) || { 
        points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
        runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0,
        holed_putts_total: 0, total_putt_attempts: 0, clutch_putts: 0,
      };
      
      const isWinner = match.winner_profile_id === p.profile_id || (!!p.team_id && match.winner_team_id === p.team_id);
      let score = s.points;
      if (match.sport === 'cricket') score = s.runs;
      if (match.sport === 'golf') score = isChipOff ? s.points : isPuttVsPutt ? s.holed_putts_total : s.strokes;

      matchStatsList.push({
        profile_id: p.profile_id,
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

    // 3.3 Update global stats
    matchStatsList.forEach(ms => {
      const g = getPlayerStats(ms.profile_id, match.sport);
      
      // Calculate Season Points
      const rank = sortedForPlacement.findIndex(s => s.profile_id === ms.profile_id) + 1;
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
      Object.keys(ms.extra).forEach(key => {
        if (typeof ms.extra[key] === 'number') {
          g.extra_stats[key] = (g.extra_stats[key] || 0) + ms.extra[key];
        } else {
          g.extra_stats[key] = ms.extra[key];
        }
      });
    });
  }

  return Array.from(globalStats.values());
}
