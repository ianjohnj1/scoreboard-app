import { describe, expect, it } from 'vitest';
import {
  applyPoolFoul,
  applyPoolMiss,
  applyPoolPot,
  createPoolState,
  getCurrentShooterId,
  getSideClearance,
  replayPoolEvents,
  type PoolSideConfig,
} from './poolEngine';

const individualSides: [PoolSideConfig, PoolSideConfig] = [
  { id: 'p1', lineup: ['p1'] },
  { id: 'p2', lineup: ['p2'] },
];

const teamSides: [PoolSideConfig, PoolSideConfig] = [
  { id: 'teamA', lineup: ['a1', 'a2'] },
  { id: 'teamB', lineup: ['b1', 'b2'] },
];

describe('createPoolState', () => {
  it('starts with an open table, side 0 breaking, and every ball unpotted', () => {
    const state = createPoolState('16_ball', individualSides);

    expect(state.tableOpen).toBe(true);
    expect(state.currentSideIndex).toBe(0);
    expect(getCurrentShooterId(state)).toBe('p1');
    expect(state.groups).toEqual([null, null]);
    expect(Object.values(state.balls).every(b => !b.potted)).toBe(true);
  });
});

describe('applyPoolPot - open table', () => {
  it('assigns groups from the first legal pot and keeps the turn with the shooter', () => {
    const state = createPoolState('16_ball', individualSides);
    const result = applyPoolPot(state, 9);

    expect(result.state.groups).toEqual(['bigs', 'smalls']);
    expect(result.state.tableOpen).toBe(false);
    expect(result.state.currentSideIndex).toBe(0);
    expect(result.state.turnPotCount).toBe(1);
    expect(result.state.balls[9]).toEqual({ potted: true, pottedBySide: 0 });
    expect(result.events.map(e => e.type)).toEqual(['pool_ball_potted']);
  });

  it('assigns the opposite group to the other side', () => {
    const state = createPoolState('16_ball', individualSides);
    const result = applyPoolPot(state, 3);

    expect(result.state.groups).toEqual(['smalls', 'bigs']);
  });
});

describe('applyPoolPot - own group vs opponent group', () => {
  it('keeps the turn and grows the streak on consecutive own-group pots', () => {
    let state = createPoolState('16_ball', individualSides);
    state = applyPoolPot(state, 1).state; // opens table, smalls to side 0
    const result = applyPoolPot(state, 2);

    expect(result.state.currentSideIndex).toBe(0);
    expect(result.state.turnPotCount).toBe(2);
    expect(result.state.longestStreakBySide).toEqual([2, 0]);
    expect(result.state.potsBySide).toEqual([2, 0]);
  });

  it('ends the turn and hands the opponent the pot when their ball goes in', () => {
    let state = createPoolState('16_ball', individualSides);
    state = applyPoolPot(state, 1).state; // side 0 = smalls, side 1 = bigs
    const result = applyPoolPot(state, 9); // side 0 shoots but sinks a bigs ball

    expect(result.state.balls[9]).toEqual({ potted: true, pottedBySide: 1 });
    expect(result.state.currentSideIndex).toBe(1);
    expect(result.state.turnPotCount).toBe(0);
    expect(result.state.potsBySide).toEqual([1, 1]);
  });
});

describe('applyPoolMiss / applyPoolFoul', () => {
  it('miss passes the turn, resets the streak, and counts against the missing side', () => {
    let state = createPoolState('16_ball', individualSides);
    state = applyPoolPot(state, 1).state;
    const result = applyPoolMiss(state);

    expect(result.state.currentSideIndex).toBe(1);
    expect(result.state.turnPotCount).toBe(0);
    expect(result.state.missesBySide).toEqual([1, 0]);
    expect(result.events).toEqual([{ type: 'pool_miss', data: {} }]);
  });

  it('foul passes the turn and logs the reason', () => {
    const state = createPoolState('16_ball', individualSides);
    const result = applyPoolFoul(state, 'cue_ball_potted');

    expect(result.state.currentSideIndex).toBe(1);
    expect(result.state.foulsBySide).toEqual([1, 0]);
    expect(result.events).toEqual([{ type: 'pool_foul', data: { reason: 'cue_ball_potted' } }]);
  });

  it('is a no-op once the game has a winner', () => {
    let state = createPoolState('16_ball', individualSides);
    SMALLS_MINUS_ONE.forEach(ball => {
      state = applyPoolPot(state, ball).state;
    });
    state = applyPoolPot(state, 8).state;
    expect(state.winnerSideIndex).toBe(0);

    const result = applyPoolMiss(state);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });
});

const SMALLS_MINUS_ONE = [1, 2, 3, 4, 5, 6, 7];

describe('applyPoolPot - the black ball', () => {
  it('wins the game for the shooter once their group is fully cleared', () => {
    let state = createPoolState('16_ball', individualSides);
    SMALLS_MINUS_ONE.forEach(ball => {
      state = applyPoolPot(state, ball).state;
    });
    expect(getSideClearance(state, 0)).toEqual({ potted: 7, total: 7 });

    const result = applyPoolPot(state, 8);

    expect(result.state.winnerSideIndex).toBe(0);
    expect(result.state.winMethod).toBe('legal_black');
    expect(result.events.map(e => e.type)).toEqual(['pool_ball_potted', 'pool_game_won']);
  });

  it('loses the game for the shooter when their group is not yet clear', () => {
    let state = createPoolState('16_ball', individualSides);
    state = applyPoolPot(state, 1).state; // side 0 = smalls, only 1 of 7 cleared
    const result = applyPoolPot(state, 8);

    expect(result.state.winnerSideIndex).toBe(1);
    expect(result.state.winMethod).toBe('opponent_potted_black_early');
  });

  it('loses for whoever pots it on a still-open table', () => {
    const state = createPoolState('16_ball', individualSides);
    const result = applyPoolPot(state, 8);

    expect(result.state.winnerSideIndex).toBe(1);
    expect(result.state.winMethod).toBe('opponent_potted_black_early');
  });
});

describe('team lineup rotation', () => {
  it('cycles a team to its next lineup slot only when the turn returns to it', () => {
    let state = createPoolState('16_ball', teamSides);
    expect(getCurrentShooterId(state)).toBe('a1');

    state = applyPoolMiss(state).state; // -> side 1, b1 shooting
    expect(getCurrentShooterId(state)).toBe('b1');

    state = applyPoolMiss(state).state; // -> side 0, rotates to a2
    expect(getCurrentShooterId(state)).toBe('a2');

    state = applyPoolMiss(state).state; // -> side 1, rotates to b2
    expect(getCurrentShooterId(state)).toBe('b2');
  });
});

describe('replayPoolEvents', () => {
  it('reconstructs the same state as applying actions live', () => {
    let live = createPoolState('16_ball', individualSides);
    live = applyPoolPot(live, 1).state;
    live = applyPoolPot(live, 2).state;
    live = applyPoolMiss(live).state;
    live = applyPoolFoul(live, 'cue_ball_potted').state;

    const replayed = replayPoolEvents(
      [
        { event_type: 'pool_ball_potted', event_data: { ball: 1 } },
        { event_type: 'pool_ball_potted', event_data: { ball: 2 } },
        { event_type: 'pool_miss', event_data: {} },
        { event_type: 'pool_foul', event_data: { reason: 'cue_ball_potted' } },
      ],
      '16_ball',
      individualSides
    );

    expect(replayed).toEqual(live);
  });

  it('stops applying events once a winner is recorded', () => {
    const events = [
      ...SMALLS_MINUS_ONE.map(ball => ({ event_type: 'pool_ball_potted', event_data: { ball } })),
      { event_type: 'pool_ball_potted', event_data: { ball: 8 } },
      { event_type: 'pool_ball_potted', event_data: { ball: 9 } },
    ];

    const replayed = replayPoolEvents(events, '16_ball', individualSides);

    expect(replayed.winnerSideIndex).toBe(0);
    expect(replayed.balls[9].potted).toBe(false);
  });
});
