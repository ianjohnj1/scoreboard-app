import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration is missing. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: (url, options = {}) => {
      // Dynamically attach the session ID to every request for RLS
      const sessionId = typeof window !== 'undefined' ? localStorage.getItem('sk_session_id') : null;
      if (sessionId) {
        const headers = new Headers(options.headers || {});
        headers.set('x-session-id', sessionId);
        options.headers = headers;
      }
      return fetch(url, options);
    },
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

// profiles.pin_hash is not readable by anon/authenticated (see
// 20260723_rls_lockdown_step3.sql) - every SELECT/RETURNING against profiles
// must enumerate columns explicitly rather than use '*'/bare select(), since
// Postgres expands '*' to every column and fails wholesale if any one of them
// isn't granted.
export const SAFE_PROFILE_COLUMNS =
  'id, username, display_name, is_guest, is_admin, avatar_color, avatar_url, catchphrase, linked_profile_id, created_at, updated_at';

export type Profile = {
  id: string;
  username: string | null;
  display_name: string;
  pin_hash: string | null;
  is_guest: boolean;
  is_admin: boolean;
  avatar_color: string;
  avatar_url: string | null;
  catchphrase: string | null;
  linked_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchRoom = {
  id: string;
  room_code: string;
  sport: string;
  custom_game_name: string | null;
  match_time: string;
  started_at?: string | null;
  status: 'active' | 'paused' | 'completed';
  is_practice: boolean;
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
  lineup_order: number | null;
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
  season_points: number;
  cricket_lifetime_runs: number;
  cricket_lifetime_wickets: number;
  golf_lifetime_points: number;
  golf_lifetime_hio: number;
  extra_stats: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PlayerCareerAnalytics = {
  profile_id: string;
  sport: string;
  is_practice: boolean;
  matches_played: number;
  matches_won: number;
  matches_lost: number;
  total_cricket_runs: number;
  total_cricket_balls_faced: number;
  strike_rate: number;
  dot_ball_percentage: number;
  boundary_percentage: number;
  // Bowling stats
  total_cricket_balls_bowled: number;
  total_cricket_runs_conceded: number;
  total_cricket_wickets_taken: number;
  total_cricket_dots_bowled: number;
  economy_rate: number;
  bowling_strike_rate: number;
  // Chip Off stats
  total_chip_off_points: number;
  total_chip_off_chips: number;
  scoring_efficiency: number;
  ace_frequency: number;
  hazard_avoidance_rating: number;
  average_proximity_tier: number;
  // PvP stats
  holed_putts_total: number;
  total_putt_attempts: number;
  career_pct_holed: number;
  clutch_putts: number;
  // Darts stats
  countdown_ppr: number;
  first_nine_ppr: number;
  checkout_pct: number;
  atw_efficiency: number;
  killer_lethality: number;
  killer_survival: number;
};

export type Comment = {
  id: string;
  context_type: 'match' | 'event';
  context_id: string;
  author_player_id: string;
  author_display_name: string;
  type: 'comment' | 'cheer';
  content: string;
  is_hidden: boolean;
  created_at: string;
};

export type Event = {
  id: string;
  title: string;
  description: string | null;
  event_datetime: string;
  location: string | null;
  created_by: string;
  created_at: string;
};

export type EventRsvp = {
  event_id: string;
  player_id: string;
  status: 'going' | 'maybe' | 'not_going';
  responded_at: string;
};

export type FanEngagementStats = {
  profile_id: string;
  total_comments_sent: number;
  total_cheers_sent: number;
  total_engagement: number;
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
  bowl_dots: number;
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
  title: string | null;
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
