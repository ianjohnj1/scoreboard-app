import { ringMatchesRule } from './board';
import type { AroundTheWorldRules, DartsApplyResult, DartsRuntimeState, DartsThrow, DartsTurnRecord } from './types';

function cloneTurns(turns: DartsTurnRecord[]) {
  return turns.map(turn => ({
    ...turn,
    darts: turn.darts.map(dart => ({ ...dart })),
  }));
}

export function createAroundTheWorldState(playerIds: string[]): DartsRuntimeState {
  const progress: Record<string, number> = {};
  playerIds.forEach(id => {
    progress[id] = 1;
  });

  return {
    variant: 'around_the_world',
    currentPlayerIdx: 0,
    currentDarts: [],
    turns: [],
    winner: null,
    aroundTheWorld: { progress },
  };
}

export function getAroundTheWorldTarget(progressValue: number): number | 'bull' {
  return progressValue > 20 ? 'bull' : progressValue;
}

export function applyAroundTheWorldThrow(
  state: DartsRuntimeState,
  playerId: string,
  throwData: DartsThrow,
  rules: AroundTheWorldRules
): DartsApplyResult {
  const progress = { ...(state.aroundTheWorld?.progress || {}) };
  const currentStep = progress[playerId] ?? 1;
  const currentTarget = getAroundTheWorldTarget(currentStep);
  const currentDarts = [...state.currentDarts.map(dart => ({ ...dart })), { ...throwData }];
  const turns = cloneTurns(state.turns);

  let advancedBy = 0;
  let hitTarget = false;
  let winnerProfileId: string | null = null;

  if (currentTarget === 'bull') {
    if (throwData.segment === 'bull' || throwData.segment === 'double_bull') {
      hitTarget = true;
      winnerProfileId = playerId;
    }
  } else if (typeof throwData.segment === 'number' && throwData.segment === currentTarget && ringMatchesRule(throwData.ring, rules.ringRestriction)) {
    hitTarget = true;
    advancedBy = rules.skipAheadViaMultiples ? Math.max(1, throwData.multiplier) : 1;
    progress[playerId] = Math.min(21, currentStep + advancedBy);
  }

  if (winnerProfileId) {
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      label: 'Around the World finish',
      eventType: 'darts_atw_throw',
    });

    return {
      state: {
        ...state,
        currentDarts: [],
        turns,
        winner: playerId,
        winnerLabel: 'Bull finish',
        aroundTheWorld: { progress },
      },
      winnerProfileId,
      event: {
        type: 'darts_atw_throw',
        data: {
          variant: 'around_the_world',
          throw: throwData,
          darts: currentDarts,
          target_before: currentTarget,
          hit_target: true,
          advanced_by: 1,
          target_after: 'completed',
          turn_complete: false,
          winner_profile_id: playerId,
        },
      },
    };
  }

  const turnEnded = currentDarts.length >= 3;
  if (turnEnded) {
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      label: hitTarget ? `Advanced to ${getAroundTheWorldTarget(progress[playerId] ?? currentStep)}` : 'No advance',
      eventType: 'darts_atw_throw',
    });
  }

  return {
    state: {
      ...state,
      currentPlayerIdx: turnEnded ? (state.currentPlayerIdx + 1) % Math.max(1, Object.keys(progress).length) : state.currentPlayerIdx,
      currentDarts: turnEnded ? [] : currentDarts,
      turns,
      aroundTheWorld: { progress },
    },
    event: {
      type: 'darts_atw_throw',
      data: {
        variant: 'around_the_world',
        throw: throwData,
        darts: currentDarts,
        target_before: currentTarget,
        hit_target: hitTarget,
        advanced_by: advancedBy,
        target_after: getAroundTheWorldTarget(progress[playerId] ?? currentStep),
        turn_complete: turnEnded,
      },
    },
  };
}
