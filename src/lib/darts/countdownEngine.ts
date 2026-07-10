import type { CountdownRules, DartsApplyResult, DartsRuntimeState, DartsThrow, DartsTurnRecord } from './types';

function cloneTurns(turns: DartsTurnRecord[]) {
  return turns.map(turn => ({
    ...turn,
    darts: turn.darts.map(dart => ({ ...dart })),
  }));
}

export function createCountdownState(playerIds: string[], rules: CountdownRules): DartsRuntimeState {
  const scores: Record<string, number> = {};
  playerIds.forEach(id => {
    scores[id] = rules.startScore;
  });

  return {
    variant: 'countdown',
    currentPlayerIdx: 0,
    currentDarts: [],
    turns: [],
    winner: null,
    countdown: { scores },
  };
}

export function applyCountdownThrow(
  state: DartsRuntimeState,
  playerId: string,
  throwData: DartsThrow,
  rules: CountdownRules
): DartsApplyResult {
  const scores = { ...(state.countdown?.scores || {}) };
  const currentScore = scores[playerId] ?? rules.startScore;
  const currentDarts = [...state.currentDarts.map(dart => ({ ...dart })), { ...throwData }];
  const turns = cloneTurns(state.turns);
  const remaining = currentScore - throwData.scoredPoints;
  const busts = remaining < 0 || (remaining === 0 && rules.doubleOut && throwData.ring !== 'double' && throwData.ring !== 'double_bull') || remaining === 1;

  if (busts) {
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      bust: true,
      label: 'Bust',
      eventType: 'darts_bust',
    });

    return {
      state: {
        ...state,
        currentPlayerIdx: (state.currentPlayerIdx + 1) % Math.max(1, Object.keys(scores).length),
        currentDarts: [],
        turns,
        countdown: { scores },
      },
      event: {
        type: 'darts_bust',
        data: {
          variant: 'countdown',
          throw: throwData,
          darts: currentDarts,
          remaining_before: currentScore,
          remaining_after: currentScore,
          bust: true,
        },
      },
    };
  }

  if (remaining === 0) {
    scores[playerId] = 0;
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      label: 'Checkout',
      eventType: 'darts_win',
    });

    return {
      state: {
        ...state,
        currentDarts: [],
        turns,
        winner: playerId,
        winnerLabel: 'Checkout complete',
        countdown: { scores },
      },
      winnerProfileId: playerId,
      event: {
        type: 'darts_win',
        data: {
          variant: 'countdown',
          throw: throwData,
          darts: currentDarts,
          remaining_before: currentScore,
          remaining_after: 0,
          checkout: true,
          double_out: rules.doubleOut,
        },
      },
    };
  }

  scores[playerId] = remaining;
  const turnEnded = currentDarts.length >= 3;

  if (turnEnded) {
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      eventType: 'darts_turn',
    });
  }

  return {
    state: {
      ...state,
      currentPlayerIdx: turnEnded ? (state.currentPlayerIdx + 1) % Math.max(1, Object.keys(scores).length) : state.currentPlayerIdx,
      currentDarts: turnEnded ? [] : currentDarts,
      turns,
      countdown: { scores },
    },
    event: {
      type: 'darts_turn',
      data: {
        variant: 'countdown',
        throw: throwData,
        darts: currentDarts,
        remaining_before: currentScore,
        remaining_after: remaining,
        turn_complete: turnEnded,
      },
    },
  };
}
