import { ringMatchesRule } from './board';
import type { DartsApplyResult, DartsRuntimeState, DartsThrow, DartsTurnRecord, KillerPlayerState, KillerRules, KillerState } from './types';

function cloneTurns(turns: DartsTurnRecord[]) {
  return turns.map(turn => ({
    ...turn,
    darts: turn.darts.map(dart => ({ ...dart })),
  }));
}

function cloneKillerPlayers(players: Record<string, KillerPlayerState>) {
  return Object.fromEntries(
    Object.entries(players).map(([playerId, playerState]) => [playerId, { ...playerState }])
  ) as Record<string, KillerPlayerState>;
}

function shuffleNumbers() {
  const numbers = Array.from({ length: 20 }, (_, index) => index + 1);
  for (let index = numbers.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [numbers[index], numbers[swapIndex]] = [numbers[swapIndex], numbers[index]];
  }
  return numbers;
}

export function createKillerState(playerIds: string[], rules: KillerRules): DartsRuntimeState {
  const shuffledTargets = shuffleNumbers();
  const players: Record<string, KillerPlayerState> = {};

  playerIds.forEach((playerId, index) => {
    players[playerId] = {
      targetNumber: shuffledTargets[index % shuffledTargets.length],
      lives: rules.startingLives,
      isKiller: false,
      isEliminated: false,
    };
  });

  return {
    variant: 'killer',
    currentPlayerIdx: 0,
    currentDarts: [],
    turns: [],
    winner: null,
    killer: {
      players,
      assignmentsLocked: false,
    },
  };
}

export function overrideKillerTargets(
  state: DartsRuntimeState,
  assignments: Record<string, number>
): DartsRuntimeState {
  if (!state.killer || state.killer.assignmentsLocked) {
    return state;
  }

  const players = cloneKillerPlayers(state.killer.players);
  Object.entries(assignments).forEach(([playerId, targetNumber]) => {
    if (players[playerId]) {
      players[playerId].targetNumber = targetNumber;
    }
  });

  return {
    ...state,
    killer: {
      ...state.killer,
      players,
    },
  };
}

export function addPlayerToKillerState(
  state: DartsRuntimeState,
  playerId: string,
  rules: KillerRules
): DartsRuntimeState {
  const killerState = state.killer;
  if (!killerState || killerState.players[playerId] !== undefined) return state;

  const usedTargets = new Set(Object.values(killerState.players).map(p => p.targetNumber));
  const allNumbers = Array.from({ length: 20 }, (_, index) => index + 1);
  const unused = allNumbers.filter(number => !usedTargets.has(number));
  const targetNumber = unused.length > 0
    ? unused[Math.floor(Math.random() * unused.length)]
    : allNumbers[Math.floor(Math.random() * allNumbers.length)];

  return {
    ...state,
    killer: {
      ...killerState,
      players: {
        ...killerState.players,
        [playerId]: {
          targetNumber,
          lives: rules.startingLives,
          isKiller: false,
          isEliminated: false,
        },
      },
    },
  };
}

function getNextActivePlayerIndex(state: DartsRuntimeState, playersOrder: string[]) {
  if (!state.killer) return state.currentPlayerIdx;
  for (let offset = 1; offset <= playersOrder.length; offset += 1) {
    const nextIndex = (state.currentPlayerIdx + offset) % playersOrder.length;
    const nextPlayer = state.killer.players[playersOrder[nextIndex]];
    if (nextPlayer && !nextPlayer.isEliminated) {
      return nextIndex;
    }
  }
  return state.currentPlayerIdx;
}

export function applyKillerThrow(
  state: DartsRuntimeState,
  playerId: string,
  playersOrder: string[],
  throwData: DartsThrow,
  rules: KillerRules
): DartsApplyResult {
  const killerState = state.killer as KillerState;
  const players = cloneKillerPlayers(killerState.players);
  const currentPlayer = players[playerId];
  const turns = cloneTurns(state.turns);
  const currentDarts = [...state.currentDarts.map(dart => ({ ...dart })), { ...throwData }];

  let activated = false;
  let selfPenalty = false;
  let hitOpponentId: string | null = null;
  let eliminatedPlayerIds: string[] = [];
  let winnerProfileId: string | null = null;

  if (!currentPlayer.isEliminated && typeof throwData.segment === 'number') {
    if (!currentPlayer.isKiller) {
      if (throwData.segment === currentPlayer.targetNumber && ringMatchesRule(throwData.ring, rules.activationRing)) {
        currentPlayer.isKiller = true;
        activated = true;
      }
    } else if (throwData.segment === currentPlayer.targetNumber) {
      currentPlayer.lives = Math.max(0, currentPlayer.lives - 1);
      selfPenalty = true;
      if (currentPlayer.lives === 0) {
        currentPlayer.isEliminated = true;
        eliminatedPlayerIds.push(playerId);
      }
    } else {
      const opponentId = Object.entries(players).find(([candidateId, candidateState]) => (
        candidateId !== playerId &&
        !candidateState.isEliminated &&
        candidateState.targetNumber === throwData.segment
      ))?.[0] || null;

      if (opponentId) {
        players[opponentId].lives = Math.max(0, players[opponentId].lives - 1);
        hitOpponentId = opponentId;
        if (players[opponentId].lives === 0) {
          players[opponentId].isEliminated = true;
          eliminatedPlayerIds.push(opponentId);
        }
      }
    }
  }

  const survivors = Object.entries(players)
    .filter(([, candidateState]) => !candidateState.isEliminated && candidateState.lives > 0)
    .map(([candidateId]) => candidateId);

  if (survivors.length === 1) {
    winnerProfileId = survivors[0];
  }

  const turnEnded = currentDarts.length >= 3 || winnerProfileId !== null;
  if (turnEnded) {
    turns.push({
      profileId: playerId,
      darts: currentDarts,
      total: currentDarts.reduce((sum, dart) => sum + dart.scoredPoints, 0),
      label: winnerProfileId ? 'Final elimination' : activated ? 'Killer activated' : hitOpponentId ? 'Life hit' : selfPenalty ? 'Self penalty' : 'Turn complete',
      eventType: 'darts_killer_throw',
    });
  }

  const nextPlayerIdx = winnerProfileId
    ? state.currentPlayerIdx
    : turnEnded
      ? getNextActivePlayerIndex(
          {
            ...state,
            killer: {
              players,
              assignmentsLocked: true,
            },
          },
          playersOrder
        )
      : state.currentPlayerIdx;

  return {
    state: {
      ...state,
      currentPlayerIdx: nextPlayerIdx,
      currentDarts: turnEnded ? [] : currentDarts,
      turns,
      winner: winnerProfileId,
      winnerLabel: winnerProfileId ? 'Last player standing' : state.winnerLabel,
      killer: {
        players,
        assignmentsLocked: true,
      },
    },
    winnerProfileId,
    event: {
      type: 'darts_killer_throw',
      data: {
        variant: 'killer',
        throw: throwData,
        darts: currentDarts,
        activated,
        self_penalty: selfPenalty,
        hit_opponent_id: hitOpponentId,
        eliminated_player_ids: eliminatedPlayerIds,
        assignments: Object.fromEntries(
          Object.entries(players).map(([candidateId, candidateState]) => [
            candidateId,
            {
              targetNumber: candidateState.targetNumber,
              lives: candidateState.lives,
              isKiller: candidateState.isKiller,
              isEliminated: candidateState.isEliminated,
            },
          ])
        ),
        turn_complete: turnEnded,
        winner_profile_id: winnerProfileId,
      },
    },
  };
}
