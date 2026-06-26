import { supabase } from './supabase';

export interface MatchStats {
  profile_id: string;
  sport: string;
  is_winner: boolean;
  score: number;
  extra_stats: Record<string, any>;
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

  let calculatedWinnerProfileId = match.winner_profile_id;
  let calculatedWinnerTeamId = match.winner_team_id;

   switch (match.sport) {
    case 'cricket': {
      const { data: cricketStats } = await supabase
        .from('cricket_player_stats')
        .select('*')
        .eq('match_id', matchId);

      const playerMap = new Map<string, any>();
      
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
          is_winner: calculatedWinnerProfileId === p.profile_id || calculatedWinnerTeamId === p.team_id,
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
        events?.forEach(e => {
          if (!e.player_id || e.event_type !== 'chip_off_score') return;
          const existing = playerMap.get(e.player_id) || { points: 0, tens: 0 };
          const pts = (e.event_data.points as number) || 0;
          existing.points += pts;
          if (pts === 10) existing.tens += 1;
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
          const s = playerMap.get(p.profile_id);
          if (!s) return;
          
          stats.push({
            profile_id: p.profile_id,
            sport: 'chip_off',
            is_winner: calculatedWinnerProfileId === p.profile_id,
            score: s.points,
            extra_stats: s
          });
        });
      } else {
        const { data: golfScores } = await supabase
          .from('golf_scores')
          .select('*')
          .eq('match_id', matchId);

        const playerMap = new Map<string, any>();
        
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
          const s = playerMap.get(p.profile_id);
          if (!s || s.strokes === 0) return;

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
            const darts = (e.event_data.darts as number[]) || [];
            existing.points += darts.reduce((a, b) => a + b, 0);
            break;
          case 'darts_win':
            existing.wins += 1;
            const finalDarts = (e.event_data.darts as number[]) || [];
            existing.points += finalDarts.reduce((a, b) => a + b, 0);
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

        if (!pid && e.event_data?.team !== undefined) {
          // Basketball or generic team index
          const teamIdx = e.event_data.team as number;
          const teamId = match.winner_team_id || (teams && teams[teamIdx]?.id); 
          if (teamId) {
            // Attribute to all players in that team for career stats
            const teamPlayers = players.filter(p => p.team_id === teamId);
            teamPlayers.forEach(tp => {
              updatePlayerStats(tp.profile_id, e);
            });
            return;
          }
        }

        if (!pid && e.team_id) {
          // Attribute to all players in the team if no specific player is identified
          const teamPlayers = players.filter(p => p.team_id === e.team_id);
          teamPlayers.forEach(tp => {
            updatePlayerStats(tp.profile_id, e);
          });
          return;
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
          is_winner: match.winner_profile_id === p.profile_id || match.winner_team_id === p.team_id,
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

  // Process the stats
  const errors: any[] = [];
  for (const stat of matchStats) {
    try {
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
          matches_played: existing.matches_played + 1,
          matches_won: existing.matches_won + (stat.is_winner ? 1 : 0),
          matches_lost: existing.matches_lost + (stat.is_winner ? 0 : 1),
          total_score: existing.total_score + stat.score,
          best_score: existing.best_score === null ? stat.score : 
                      (stat.sport === 'golf' 
                        ? (stat.score > 0 ? Math.min(existing.best_score, stat.score) : existing.best_score)
                        : Math.max(existing.best_score, stat.score)),
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
    .eq('status', 'completed');

  if (matchesError) throw matchesError;
  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map(m => m.id);

  // 2. Fetch all players and events for these matches
  const [{ data: players }, { data: events }, { data: profiles }] = await Promise.all([
    supabase.from('match_players').select('*').in('match_id', matchIds),
    supabase.from('match_events').select('*').in('match_id', matchIds).eq('is_undone', false),
    supabase.from('profiles').select('*')
  ]);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const globalStats = new Map<string, any>();

  // Helper to get/init global player stats
  const getPlayerStats = (profileId: string, sport: string) => {
    const key = `${profileId}:${sport}`;
    if (!globalStats.has(key)) {
      globalStats.set(key, {
        profile_id: profileId,
        sport,
        profile: profileMap.get(profileId),
        matches_played: 0,
        matches_won: 0,
        matches_lost: 0,
        total_score: 0,
        best_score: null,
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
    
    const playerMap = new Map<string, any>();

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
          const darts = (e.event_data.darts as number[]) || [];
          existing.points += darts.reduce((a, b) => a + b, 0);
          break;
        case 'darts_win':
          existing.wins += 1;
          const finalDarts = (e.event_data.darts as number[]) || [];
          existing.points += finalDarts.reduce((a, b) => a + b, 0);
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
      if (!pid && e.event_data?.team !== undefined) {
        const teamId = match.winner_team_id; // Simple heuristic
        if (teamId) {
          matchPlayers.filter(p => p.team_id === teamId).forEach(tp => updateLocalPlayerStats(tp.profile_id, e));
          return;
        }
      }
      if (pid) updateLocalPlayerStats(pid, e);
    });

    // Update global stats from local match results
    matchPlayers.forEach(p => {
      const s = playerMap.get(p.profile_id) || { 
        points: 0, tens: 0, wins: 0, frames: 0, sets: 0,
        runs: 0, wickets: 0, balls: 0, strokes: 0, hio: 0 
      };
      
      const isWinner = match.winner_profile_id === p.profile_id || match.winner_team_id === p.team_id;
      const g = getPlayerStats(p.profile_id, match.sport);
      
      let score = s.points;
      if (match.sport === 'cricket') score = s.runs;
      if (match.sport === 'golf') score = s.strokes;

      g.matches_played += 1;
      g.matches_won += isWinner ? 1 : 0;
      g.matches_lost += isWinner ? 0 : 1;
      g.total_score += score;
      
      // Update best score
      if (g.best_score === null) {
        g.best_score = score;
      } else {
        if (match.sport === 'golf') {
          if (score > 0) g.best_score = Math.min(g.best_score, score);
        } else {
          g.best_score = Math.max(g.best_score, score);
        }
      }

      // Merge extra stats
      Object.keys(s).forEach(key => {
        if (typeof s[key] === 'number') {
          g.extra_stats[key] = (g.extra_stats[key] || 0) + s[key];
        } else {
          g.extra_stats[key] = s[key];
        }
      });
    });
  }

  return Array.from(globalStats.values());
}
