import { describe, expect, it } from 'vitest';
import { createThrow } from './board';
import {
  addPlayerToKillerState,
  applyKillerThrow,
  createKillerState,
  overrideKillerTargets,
} from './killerEngine';
import type { KillerRules } from './types';

const rules: KillerRules = { startingLives: 3, activationRing: 'any_segment' };
const playersOrder = ['p1', 'p2', 'p3'];

function setup() {
  let state = createKillerState(playersOrder, rules);
  state = overrideKillerTargets(state, { p1: 1, p2: 2, p3: 3 });
  return state;
}

describe('createKillerState', () => {
  it('gives every player the starting lives and no killer status', () => {
    const state = createKillerState(playersOrder, rules);
    playersOrder.forEach(id => {
      expect(state.killer?.players[id].lives).toBe(3);
      expect(state.killer?.players[id].isKiller).toBe(false);
      expect(state.killer?.players[id].isEliminated).toBe(false);
    });
  });

  it('assigns each player a distinct target number between 1 and 20', () => {
    const state = createKillerState(playersOrder, rules);
    const targets = playersOrder.map(id => state.killer?.players[id].targetNumber);
    expect(new Set(targets).size).toBe(playersOrder.length);
    targets.forEach(t => {
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(20);
    });
  });
});

describe('overrideKillerTargets', () => {
  it('applies explicit assignments before locking', () => {
    const state = setup();
    expect(state.killer?.players.p1.targetNumber).toBe(1);
    expect(state.killer?.players.p2.targetNumber).toBe(2);
  });

  it('is a no-op once assignments are locked', () => {
    let state = setup();
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules).state;
    expect(state.killer?.assignmentsLocked).toBe(true);

    const attempt = overrideKillerTargets(state, { p1: 9 });
    expect(attempt.killer?.players.p1.targetNumber).toBe(1);
  });
});

describe('addPlayerToKillerState', () => {
  it('assigns a target number not already in use', () => {
    let state = createKillerState(['p1', 'p2'], rules);
    state = overrideKillerTargets(state, { p1: 1, p2: 2 });
    const withThird = addPlayerToKillerState(state, 'p3', rules);

    expect(withThird.killer?.players.p3.targetNumber).not.toBe(1);
    expect(withThird.killer?.players.p3.targetNumber).not.toBe(2);
  });

  it('does nothing if the player already exists', () => {
    const state = setup();
    const result = addPlayerToKillerState(state, 'p1', rules);
    expect(result).toBe(state);
  });
});

describe('applyKillerThrow', () => {
  it('activates a player who hits their own number while not yet a killer', () => {
    const state = setup();
    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules);

    expect(result.state.killer?.players.p1.isKiller).toBe(true);
    expect(result.state.killer?.players.p1.lives).toBe(3);
    expect(result.event.data.activated).toBe(true);
  });

  it('penalizes an activated killer who hits their own number again', () => {
    let state = setup();
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules).state;
    // End p1's turn so hitting their own number again reads as self-penalty, not re-activation.
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(5, 'single'), rules).state;
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(5, 'single'), rules).state;

    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules);
    expect(result.state.killer?.players.p1.lives).toBe(2);
    expect(result.event.data.self_penalty).toBe(true);
  });

  it('takes a life from an opponent when an activated killer hits their number', () => {
    let state = setup();
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules).state;
    state = { ...state, currentDarts: [] };

    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(2, 'single'), rules);
    expect(result.state.killer?.players.p2.lives).toBe(2);
    expect(result.event.data.hit_opponent_id).toBe('p2');
  });

  it('eliminates an opponent who reaches zero lives', () => {
    let state = setup();
    state.killer!.players.p2.lives = 1;
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules).state;
    state = { ...state, currentDarts: [] };

    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(2, 'single'), rules);
    expect(result.state.killer?.players.p2.isEliminated).toBe(true);
    expect(result.event.data.eliminated_player_ids).toContain('p2');
  });

  it('declares the last player standing the winner', () => {
    let state = setup();
    state.killer!.players.p2.isEliminated = true;
    state.killer!.players.p2.lives = 0;
    state.killer!.players.p3.lives = 1;
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(1, 'single'), rules).state;
    state = { ...state, currentDarts: [] };

    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(3, 'single'), rules);
    expect(result.winnerProfileId).toBe('p1');
    expect(result.state.winner).toBe('p1');
  });

  it('skips eliminated players when rotating to the next turn', () => {
    let state = setup();
    state.killer!.players.p2.isEliminated = true;
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(9, 'single'), rules).state;
    state = applyKillerThrow(state, 'p1', playersOrder, createThrow(9, 'single'), rules).state;
    const result = applyKillerThrow(state, 'p1', playersOrder, createThrow(9, 'single'), rules);

    expect(result.state.currentPlayerIdx).toBe(2); // p3, skipping eliminated p2
  });
});
