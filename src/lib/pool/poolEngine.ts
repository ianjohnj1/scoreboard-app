export type PoolVariant = '16_ball' | '8_ball';
export type PoolGroup = 'bigs' | 'smalls';
export type PoolSideIndex = 0 | 1;

export interface PoolSideConfig {
  id: string;
  lineup: string[];
}

export interface PoolBallState {
  potted: boolean;
  pottedBySide: PoolSideIndex | null;
}

export interface PoolRuntimeState {
  variant: PoolVariant;
  sides: [PoolSideConfig, PoolSideConfig];
  balls: Record<number, PoolBallState>;
  groups: [PoolGroup | null, PoolGroup | null];
  tableOpen: boolean;
  currentSideIndex: PoolSideIndex;
  shooterIndexBySide: [number, number];
  turnsStartedBySide: [number, number];
  turnPotCount: number;
  longestStreakBySide: [number, number];
  potsBySide: [number, number];
  missesBySide: [number, number];
  foulsBySide: [number, number];
  winnerSideIndex: PoolSideIndex | null;
  winMethod: 'legal_black' | 'opponent_potted_black_early' | null;
}

export type PoolEventType = 'pool_ball_potted' | 'pool_miss' | 'pool_foul' | 'pool_game_won';

export interface PoolEventRecord {
  type: PoolEventType;
  data: Record<string, unknown>;
}

export interface PoolApplyResult {
  state: PoolRuntimeState;
  events: PoolEventRecord[];
  winnerSideIndex?: PoolSideIndex;
}

const SMALLS = [1, 2, 3, 4, 5, 6, 7];
const BIGS = [9, 10, 11, 12, 13, 14, 15];
export const POOL_BALL_NUMBERS = [...SMALLS, 8, ...BIGS];

export function ballGroupOf(ball: number): PoolGroup | null {
  if (SMALLS.includes(ball)) return 'smalls';
  if (BIGS.includes(ball)) return 'bigs';
  return null;
}

function otherGroup(group: PoolGroup): PoolGroup {
  return group === 'bigs' ? 'smalls' : 'bigs';
}

function otherSide(side: PoolSideIndex): PoolSideIndex {
  return side === 0 ? 1 : 0;
}

function groupBalls(group: PoolGroup): number[] {
  return group === 'bigs' ? BIGS : SMALLS;
}

export function createPoolState(variant: PoolVariant, sides: [PoolSideConfig, PoolSideConfig]): PoolRuntimeState {
  const balls: Record<number, PoolBallState> = {};
  POOL_BALL_NUMBERS.forEach(n => {
    balls[n] = { potted: false, pottedBySide: null };
  });

  return {
    variant,
    sides,
    balls,
    groups: [null, null],
    tableOpen: true,
    currentSideIndex: 0,
    shooterIndexBySide: [0, 0],
    turnsStartedBySide: [1, 0],
    turnPotCount: 0,
    longestStreakBySide: [0, 0],
    potsBySide: [0, 0],
    missesBySide: [0, 0],
    foulsBySide: [0, 0],
    winnerSideIndex: null,
    winMethod: null,
  };
}

export function getCurrentShooterId(state: PoolRuntimeState): string | null {
  const side = state.sides[state.currentSideIndex];
  const idx = state.shooterIndexBySide[state.currentSideIndex];
  return side.lineup[idx] ?? side.lineup[0] ?? null;
}

export function getSideClearance(state: PoolRuntimeState, side: PoolSideIndex): { potted: number; total: number } {
  const group = state.groups[side];
  if (!group) return { potted: 0, total: 7 };
  const total = groupBalls(group);
  return { potted: total.filter(b => state.balls[b].potted).length, total: total.length };
}

// Table-opening group assignment and the resulting win/loss on the 8-ball are
// the only two rules with real branching; everything else is a turn pass.
// Turn passing (miss/foul/potting the opponent's ball) rotates to the other
// side's next lineup slot - team pairs alternate strictly by lineup order,
// same convention as PvPRoom's advancePlayerForTeam.
function endTurn(state: PoolRuntimeState): PoolRuntimeState {
  const nextSide = otherSide(state.currentSideIndex);
  const nextLineup = state.sides[nextSide].lineup;
  const shooterIndexBySide: [number, number] = [...state.shooterIndexBySide];
  const turnsStartedBySide: [number, number] = [...state.turnsStartedBySide];

  // Only rotate the lineup once a side has already had a turn - otherwise
  // their very first turn ever would skip straight past lineup slot 0.
  if (nextLineup.length > 1 && turnsStartedBySide[nextSide] > 0) {
    shooterIndexBySide[nextSide] = (shooterIndexBySide[nextSide] + 1) % nextLineup.length;
  }
  turnsStartedBySide[nextSide] += 1;

  return {
    ...state,
    currentSideIndex: nextSide,
    shooterIndexBySide,
    turnsStartedBySide,
    turnPotCount: 0,
  };
}

export function applyPoolMiss(state: PoolRuntimeState): PoolApplyResult {
  if (state.winnerSideIndex !== null) return { state, events: [] };
  const side = state.currentSideIndex;
  const missesBySide: [number, number] = [...state.missesBySide];
  missesBySide[side] += 1;

  return {
    state: endTurn({ ...state, missesBySide }),
    events: [{ type: 'pool_miss', data: {} }],
  };
}

export function applyPoolFoul(state: PoolRuntimeState, reason: string = 'cue_ball_potted'): PoolApplyResult {
  if (state.winnerSideIndex !== null) return { state, events: [] };
  const side = state.currentSideIndex;
  const foulsBySide: [number, number] = [...state.foulsBySide];
  foulsBySide[side] += 1;

  return {
    state: endTurn({ ...state, foulsBySide }),
    events: [{ type: 'pool_foul', data: { reason } }],
  };
}

export function applyPoolPot(state: PoolRuntimeState, ball: number): PoolApplyResult {
  if (state.winnerSideIndex !== null) return { state, events: [] };
  if (!state.balls[ball] || state.balls[ball].potted) return { state, events: [] };

  const side = state.currentSideIndex;
  const events: PoolEventRecord[] = [];

  if (ball === 8) {
    const group = state.groups[side];
    const clearedOwnGroup = group !== null && groupBalls(group).every(b => state.balls[b].potted);
    const balls = { ...state.balls, 8: { potted: true, pottedBySide: side } };

    if (!clearedOwnGroup) {
      const winnerSideIndex = otherSide(side);
      events.push({ type: 'pool_ball_potted', data: { ball: 8, group: null, own_ball: false } });
      events.push({ type: 'pool_game_won', data: { method: 'opponent_potted_black_early' } });
      return {
        state: { ...state, balls, winnerSideIndex, winMethod: 'opponent_potted_black_early' },
        events,
        winnerSideIndex,
      };
    }

    events.push({ type: 'pool_ball_potted', data: { ball: 8, group, own_ball: true } });
    events.push({ type: 'pool_game_won', data: { method: 'legal_black' } });
    return {
      state: { ...state, balls, winnerSideIndex: side, winMethod: 'legal_black' },
      events,
      winnerSideIndex: side,
    };
  }

  const potGroup = ballGroupOf(ball)!;
  const opensTable = state.tableOpen;
  let groups = state.groups;

  if (opensTable) {
    groups = side === 0 ? [potGroup, otherGroup(potGroup)] : [otherGroup(potGroup), potGroup];
  }

  const isOwnBall = opensTable ? true : groups[side] === potGroup;
  const pottedBySide: PoolSideIndex = isOwnBall ? side : otherSide(side);
  const balls = { ...state.balls, [ball]: { potted: true, pottedBySide } };
  events.push({ type: 'pool_ball_potted', data: { ball, group: potGroup, own_ball: isOwnBall } });

  if (isOwnBall) {
    const turnPotCount = state.turnPotCount + 1;
    const longestStreakBySide: [number, number] = [...state.longestStreakBySide];
    longestStreakBySide[side] = Math.max(longestStreakBySide[side], turnPotCount);
    const potsBySide: [number, number] = [...state.potsBySide];
    potsBySide[side] += 1;

    return {
      state: { ...state, balls, groups, tableOpen: false, turnPotCount, longestStreakBySide, potsBySide },
      events,
    };
  }

  const potsBySide: [number, number] = [...state.potsBySide];
  potsBySide[pottedBySide] += 1;

  return {
    state: endTurn({ ...state, balls, groups, tableOpen: false, potsBySide }),
    events,
  };
}

export interface ReplayableEvent {
  event_type: string;
  event_data: Record<string, unknown>;
}

// Group assignment isn't persisted as its own event - it's a pure function of
// which side pots the table-opening ball, so replaying pool_ball_potted alone
// reconstructs it deterministically. Storing it separately would just be a
// second copy of the same fact to keep in sync.
export function replayPoolEvents(
  events: ReplayableEvent[],
  variant: PoolVariant,
  sides: [PoolSideConfig, PoolSideConfig]
): PoolRuntimeState {
  let state = createPoolState(variant, sides);

  for (const evt of events) {
    if (state.winnerSideIndex !== null) break;

    if (evt.event_type === 'pool_ball_potted') {
      const ball = Number(evt.event_data.ball);
      if (Number.isFinite(ball)) state = applyPoolPot(state, ball).state;
    } else if (evt.event_type === 'pool_miss') {
      state = applyPoolMiss(state).state;
    } else if (evt.event_type === 'pool_foul') {
      state = applyPoolFoul(state, evt.event_data.reason as string).state;
    }
  }

  return state;
}
