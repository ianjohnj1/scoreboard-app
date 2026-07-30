import { describe, expect, it } from 'vitest';
import { createThrow } from './board';
import {
  applyAroundTheWorldThrow,
  createAroundTheWorldState,
  getAroundTheWorldTarget,
} from './aroundTheWorldEngine';
import type { AroundTheWorldRules } from './types';

const anySegmentRules: AroundTheWorldRules = { skipAheadViaMultiples: false, ringRestriction: 'any_segment' };
const players = ['p1', 'p2'];

describe('getAroundTheWorldTarget', () => {
  it('targets bull once progress passes 20', () => {
    expect(getAroundTheWorldTarget(20)).toBe(20);
    expect(getAroundTheWorldTarget(21)).toBe('bull');
  });
});

describe('applyAroundTheWorldThrow', () => {
  it('advances by one on hitting the current target with any ring', () => {
    const state = createAroundTheWorldState(players);
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(1, 'triple'), anySegmentRules);

    expect(result.state.aroundTheWorld?.progress.p1).toBe(2);
    expect(result.event.data.hit_target).toBe(true);
  });

  it('does not advance on a miss of the current target', () => {
    const state = createAroundTheWorldState(players);
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(5, 'single'), anySegmentRules);

    expect(result.state.aroundTheWorld?.progress.p1).toBe(1);
    expect(result.event.data.hit_target).toBe(false);
  });

  it('advances by the multiplier when skipAheadViaMultiples is enabled', () => {
    const skipRules: AroundTheWorldRules = { skipAheadViaMultiples: true, ringRestriction: 'any_segment' };
    const state = createAroundTheWorldState(players);
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(1, 'triple'), skipRules);

    expect(result.state.aroundTheWorld?.progress.p1).toBe(4);
  });

  it('rejects a hit on the right number but wrong ring under doubles_only', () => {
    const doublesOnlyRules: AroundTheWorldRules = { skipAheadViaMultiples: false, ringRestriction: 'doubles_only' };
    const state = createAroundTheWorldState(players);
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(1, 'single'), doublesOnlyRules);

    expect(result.state.aroundTheWorld?.progress.p1).toBe(1);
    expect(result.event.data.hit_target).toBe(false);
  });

  it('caps progress at 21 (bull) and never advances past it', () => {
    const skipRules: AroundTheWorldRules = { skipAheadViaMultiples: true, ringRestriction: 'any_segment' };
    let state = createAroundTheWorldState(['p1']);
    state = { ...state, aroundTheWorld: { progress: { p1: 20 } } };
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(20, 'triple'), skipRules);

    expect(result.state.aroundTheWorld?.progress.p1).toBe(21);
  });

  it('declares a winner on hitting bull once progress is at bull', () => {
    let state = createAroundTheWorldState(['p1']);
    state = { ...state, aroundTheWorld: { progress: { p1: 21 } } };
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow('bull', 'bull'), anySegmentRules);

    expect(result.winnerProfileId).toBe('p1');
    expect(result.state.winner).toBe('p1');
  });

  it('rotates to the next player after three darts with no winner', () => {
    let state = createAroundTheWorldState(players);
    state = applyAroundTheWorldThrow(state, 'p1', createThrow(5, 'single'), anySegmentRules).state;
    state = applyAroundTheWorldThrow(state, 'p1', createThrow(5, 'single'), anySegmentRules).state;
    const result = applyAroundTheWorldThrow(state, 'p1', createThrow(5, 'single'), anySegmentRules);

    expect(result.state.currentPlayerIdx).toBe(1);
    expect(result.state.currentDarts).toHaveLength(0);
  });
});
