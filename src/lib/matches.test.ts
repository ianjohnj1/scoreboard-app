import { describe, expect, it, vi } from 'vitest';

// matches.ts imports the real supabase client at module load, which throws
// without VITE_SUPABASE_URL/ANON_KEY set. Stub it out so these pure-function
// tests don't depend on .env being present (see src/lib/supabase.ts).
vi.mock('./supabase', () => ({ supabase: {} }));

const {
  STALE_MATCH_THRESHOLD_MS,
  isMatchStale,
  getMatchDisplayStatus,
  generateRoomCode,
  getSportIcon,
  getSportLabel,
} = await import('./matches');

type MatchLike = Parameters<typeof isMatchStale>[0];

function makeMatch(overrides: Partial<MatchLike>): MatchLike {
  return {
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('isMatchStale', () => {
  it('is false for a non-active match regardless of age', () => {
    const old = new Date(Date.now() - STALE_MATCH_THRESHOLD_MS * 2).toISOString();
    expect(isMatchStale(makeMatch({ status: 'completed', updated_at: old }))).toBe(false);
    expect(isMatchStale(makeMatch({ status: 'paused', updated_at: old }))).toBe(false);
  });

  it('is false for an active match updated recently', () => {
    expect(isMatchStale(makeMatch({ status: 'active', updated_at: new Date().toISOString() }))).toBe(false);
  });

  it('is true for an active match past the stale threshold', () => {
    const old = new Date(Date.now() - STALE_MATCH_THRESHOLD_MS - 1000).toISOString();
    expect(isMatchStale(makeMatch({ status: 'active', updated_at: old }))).toBe(true);
  });

  it('falls back to created_at when updated_at is missing', () => {
    const old = new Date(Date.now() - STALE_MATCH_THRESHOLD_MS - 1000).toISOString();
    expect(isMatchStale(makeMatch({ status: 'active', updated_at: '', created_at: old }))).toBe(true);
  });
});

describe('getMatchDisplayStatus', () => {
  it('reads completed matches as done', () => {
    expect(getMatchDisplayStatus(makeMatch({ status: 'completed' }))).toBe('done');
  });

  it('reads paused matches as paused', () => {
    expect(getMatchDisplayStatus(makeMatch({ status: 'paused' }))).toBe('paused');
  });

  it('reads a fresh active match as live', () => {
    expect(getMatchDisplayStatus(makeMatch({ status: 'active', updated_at: new Date().toISOString() }))).toBe('live');
  });

  it('reads a stale active match as paused, not live', () => {
    const old = new Date(Date.now() - STALE_MATCH_THRESHOLD_MS - 1000).toISOString();
    expect(getMatchDisplayStatus(makeMatch({ status: 'active', updated_at: old }))).toBe('paused');
  });

  // Guards the dashboard's strict live/active/completed partition documented
  // in CLAUDE.md: every match must land in exactly one of the three sections.
  it('never returns live and paused for the same match under different reads', () => {
    const match = makeMatch({ status: 'active', updated_at: new Date().toISOString() });
    expect(getMatchDisplayStatus(match)).toBe(isMatchStale(match) ? 'paused' : 'live');
  });
});

describe('generateRoomCode', () => {
  it('returns 8 uppercase hex characters', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[0-9A-F]{8}$/);
  });

  it('is not obviously predictable across calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBe(20);
  });
});

describe('getSportIcon / getSportLabel', () => {
  it('returns a distinct icon for each documented sport (custom shares the fallback by design)', () => {
    const expected: Record<string, string> = {
      cricket: '🏏',
      golf: '⛳',
      darts: '🎯',
      table_tennis: '🏓',
      pool: '🎱',
      basketball: '🏀',
      cards: '🃏',
      custom: '🎮',
    };
    for (const [sport, icon] of Object.entries(expected)) {
      expect(getSportIcon(sport)).toBe(icon);
    }
  });

  it('falls back to the generic icon for an unknown sport', () => {
    expect(getSportIcon('unknown_sport')).toBe('🎮');
  });

  it('prefers a custom name over any computed label', () => {
    expect(getSportLabel('cricket', 'Sunday Smash')).toBe('Sunday Smash');
  });

  it('labels each documented darts/golf/cricket variant distinctly', () => {
    expect(getSportLabel('golf', null, 'chip_off')).toBe('Chip Off');
    expect(getSportLabel('golf', null, 'putt_vs_putt')).toBe('PvP (Putt vs Putt)');
    expect(getSportLabel('cricket', null, 'backyard')).toBe('Backyard Cricket');
    expect(getSportLabel('darts', null, 'countdown')).toBe('Darts - 501/301');
    expect(getSportLabel('darts', null, 'around_the_world')).toBe('Darts - Around the World');
    expect(getSportLabel('darts', null, 'killer')).toBe('Darts - Killer');
  });

  it('falls back to Unknown Sport for an unlisted sport with no variant', () => {
    expect(getSportLabel('unknown_sport')).toBe('Unknown Sport');
  });
});
