import { describe, expect, it } from 'vitest';
import { createThrow } from './board';
import { applyCountdownThrow, createCountdownState } from './countdownEngine';
import type { CountdownRules } from './types';

const rules: CountdownRules = { startScore: 501, doubleOut: true };
const players = ['p1', 'p2'];

describe('applyCountdownThrow', () => {
  it('subtracts scored points and keeps the same player mid-turn', () => {
    const state = createCountdownState(players, rules);
    const result = applyCountdownThrow(state, 'p1', createThrow(20, 'triple'), rules);

    expect(result.state.countdown?.scores.p1).toBe(501 - 60);
    expect(result.state.currentPlayerIdx).toBe(0);
    expect(result.state.currentDarts).toHaveLength(1);
    expect(result.event.type).toBe('darts_turn');
  });

  it('rotates to the next player after the third dart of a turn', () => {
    let state = createCountdownState(players, rules);
    state = applyCountdownThrow(state, 'p1', createThrow(20, 'single'), rules).state;
    state = applyCountdownThrow(state, 'p1', createThrow(20, 'single'), rules).state;
    const result = applyCountdownThrow(state, 'p1', createThrow(20, 'single'), rules);

    expect(result.state.currentPlayerIdx).toBe(1);
    expect(result.state.currentDarts).toHaveLength(0);
    expect(result.state.countdown?.scores.p1).toBe(501 - 60);
  });

  it('busts and resets the score when a throw would take the total below zero', () => {
    const state = createCountdownState(['p1'], { startScore: 20, doubleOut: false });
    const result = applyCountdownThrow(state, 'p1', createThrow(20, 'triple'), { startScore: 20, doubleOut: false });

    expect(result.event.type).toBe('darts_bust');
    expect(result.state.countdown?.scores.p1).toBe(20);
    expect(result.state.turns[0].bust).toBe(true);
  });

  it('busts on reaching exactly 1 remaining, single-out or not', () => {
    const state = createCountdownState(['p1'], { startScore: 2, doubleOut: false });
    const result = applyCountdownThrow(state, 'p1', createThrow(1, 'single'), { startScore: 2, doubleOut: false });

    expect(result.event.type).toBe('darts_bust');
    expect(result.state.countdown?.scores.p1).toBe(2);
  });

  it('busts on a non-double checkout when doubleOut is required', () => {
    const state = createCountdownState(['p1'], rules);
    const almostState = { ...state, countdown: { scores: { p1: 20 } } };
    const result = applyCountdownThrow(almostState, 'p1', createThrow(20, 'single'), rules);

    expect(result.event.type).toBe('darts_bust');
    expect(result.state.countdown?.scores.p1).toBe(20);
  });

  it('declares a winner on an exact double-out checkout', () => {
    const state = createCountdownState(['p1'], rules);
    const almostState = { ...state, countdown: { scores: { p1: 40 } } };
    const result = applyCountdownThrow(almostState, 'p1', createThrow(20, 'double'), rules);

    expect(result.event.type).toBe('darts_win');
    expect(result.winnerProfileId).toBe('p1');
    expect(result.state.winner).toBe('p1');
    expect(result.state.countdown?.scores.p1).toBe(0);
  });

  it('allows a single-segment checkout when doubleOut is false', () => {
    const openRules: CountdownRules = { startScore: 501, doubleOut: false };
    const state = createCountdownState(['p1'], openRules);
    const almostState = { ...state, countdown: { scores: { p1: 20 } } };
    const result = applyCountdownThrow(almostState, 'p1', createThrow(20, 'single'), openRules);

    expect(result.event.type).toBe('darts_win');
    expect(result.winnerProfileId).toBe('p1');
  });
});
