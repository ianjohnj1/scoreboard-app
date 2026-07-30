import { describe, expect, it, vi } from 'vitest';

// stats.ts imports the real supabase client at module load, which throws
// without VITE_SUPABASE_URL/ANON_KEY set. Stub it out so these pure-function
// tests don't depend on .env being present (see src/lib/supabase.ts).
vi.mock('./supabase', () => ({ supabase: {}, SAFE_PROFILE_COLUMNS: '' }));

const { calculatePlacementSP, groupByMatchId, SEASON_POINT_RULES } = await import('./stats');

describe('calculatePlacementSP', () => {
  it('matches SEASON_POINT_RULES.placement for ranks 1 through 4', () => {
    expect(calculatePlacementSP(1)).toBe(SEASON_POINT_RULES.placement[0].points);
    expect(calculatePlacementSP(2)).toBe(SEASON_POINT_RULES.placement[1].points);
    expect(calculatePlacementSP(3)).toBe(SEASON_POINT_RULES.placement[2].points);
    expect(calculatePlacementSP(4)).toBe(SEASON_POINT_RULES.placement[3].points);
  });

  it('falls back to the completion points for any rank past 3rd', () => {
    expect(calculatePlacementSP(5)).toBe(SEASON_POINT_RULES.placement[3].points);
    expect(calculatePlacementSP(10)).toBe(SEASON_POINT_RULES.placement[3].points);
  });
});

describe('groupByMatchId', () => {
  it('buckets rows by match_id, preserving within-match order', () => {
    const rows = [
      { match_id: 'a', v: 1 },
      { match_id: 'b', v: 2 },
      { match_id: 'a', v: 3 },
    ];
    const grouped = groupByMatchId(rows);

    expect(grouped.get('a')).toEqual([{ match_id: 'a', v: 1 }, { match_id: 'a', v: 3 }]);
    expect(grouped.get('b')).toEqual([{ match_id: 'b', v: 2 }]);
    expect(grouped.has('c')).toBe(false);
  });

  it('returns an empty map for null or empty input', () => {
    expect(groupByMatchId(null).size).toBe(0);
    expect(groupByMatchId([]).size).toBe(0);
  });
});
