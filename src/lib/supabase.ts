import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

export type Profile = {
  id: string;
  username: string | null;
  display_name: string;
  pin_hash: string | null;
  is_guest: boolean;
  is_admin: boolean;
  avatar_color: string;
  linked_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchRoom = {
  id: string;
  room_code: string;
  sport: string;
  custom_game_name: string | null;
  status: 'active' | 'paused' | 'completed';
  created_by: string | null;
  winner_team_id: string | null;
  winner_profile_id: string | null;
  house_rules: Record<string, unknown>;
  custom_config: Record<string, unknown>;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchTeam = {
  id: string;
  match_id: string;
  team_name: string;
  team_color: string;
  sort_order: number;
  created_at: string;
};

export type MatchPlayer = {
  id: string;
  match_id: string;
  profile_id: string;
  team_id: string | null;
  batting_order: number | null;
  bowling_order: number | null;
  role: 'player' | 'spectator' | 'scorer';
  created_at: string;
};

export type MatchEvent = {
  id: string;
  match_id: string;
  sequence_num: number;
  event_type: string;
  event_data: Record<string, unknown>;
  player_id: string | null;
  team_id: string | null;
  recorded_by: string | null;
  is_undone: boolean;
  created_at: string;
};

export type ActiveSession = {
  id: string;
  profile_id: string;
  match_id: string | null;
  last_seen: string;
  created_at: string;
};

export type PlayerCareerStats = {
  id: string;
  profile_id: string;
  sport: string;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  total_score: number;
  best_score: number | null;
  extra_stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CricketInnings = {
  id: string;
  match_id: string;
  innings_number: number;
  batting_team_id: string | null;
  bowling_team_id: string | null;
  total_runs: number;
  wickets: number;
  balls: number;
  extras_wide: number;
  extras_noball: number;
  extras_bye: number;
  extras_legbye: number;
  current_batter1_id: string | null;
  current_batter2_id: string | null;
  current_bowler_id: string | null;
  target_runs: number | null;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type CricketPlayerStats = {
  id: string;
  innings_id: string;
  match_id: string;
  profile_id: string;
  bat_runs: number;
  bat_balls: number;
  bat_dots: number;
  bat_ones: number;
  bat_twos: number;
  bat_threes: number;
  bat_fours: number;
  bat_fives: number;
  bat_sixes: number;
  bat_dismissed: boolean;
  bat_dismissal_method: string | null;
  bat_dismissed_by: string | null;
  bat_fielded_by: string | null;
  bowl_balls: number;
  bowl_maidens: number;
  bowl_runs: number;
  bowl_wickets: number;
  scored_fifty: boolean;
  scored_century: boolean;
  created_at: string;
  updated_at: string;
};

export type GolfHole = {
  id: string;
  match_id: string;
  hole_number: number;
  par: number;
  created_at: string;
};

export type GolfScore = {
  id: string;
  match_id: string;
  hole_id: string;
  profile_id: string;
  strokes: number | null;
  is_hole_in_one: boolean;
  created_at: string;
  updated_at: string;
};
