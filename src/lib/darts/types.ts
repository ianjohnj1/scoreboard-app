export type DartsVariant = 'countdown' | 'around_the_world' | 'killer';

export type DartsRing = 'single' | 'double' | 'triple' | 'bull' | 'double_bull' | 'miss';

export type DartsBoardTarget = number | 'bull' | 'double_bull' | 'miss';

export type DartsRingRule = 'any_segment' | 'doubles_only' | 'triples_only';

export type DartsThrow = {
  segment: DartsBoardTarget;
  ring: DartsRing;
  multiplier: 0 | 1 | 2 | 3;
  baseValue: number;
  scoredPoints: number;
  label: string;
};

export type DartsTurnRecord = {
  profileId: string;
  darts: DartsThrow[];
  total: number;
  label?: string;
  bust?: boolean;
  eventType: string;
};

export type DartsPendingMenu = {
  segment: number;
  x: number;
  y: number;
};

export type DartsHighlightRole =
  | 'active'
  | 'dimmed'
  | 'recent'
  | 'opponent'
  | 'self'
  | 'eliminated'
  | 'valid';

export type DartsHighlightState = Partial<Record<string, DartsHighlightRole[]>>;

export type CountdownState = {
  scores: Record<string, number>;
};

export type AroundTheWorldState = {
  progress: Record<string, number>;
};

export type KillerPlayerState = {
  targetNumber: number;
  lives: number;
  isKiller: boolean;
  isEliminated: boolean;
};

export type KillerState = {
  players: Record<string, KillerPlayerState>;
  assignmentsLocked: boolean;
};

export type DartsRuntimeState = {
  variant: DartsVariant;
  currentPlayerIdx: number;
  currentDarts: DartsThrow[];
  turns: DartsTurnRecord[];
  winner: string | null;
  winnerLabel?: string;
  countdown?: CountdownState;
  aroundTheWorld?: AroundTheWorldState;
  killer?: KillerState;
};

export type DartsEventDescriptor = {
  type: string;
  data: Record<string, unknown>;
};

export type DartsApplyResult = {
  state: DartsRuntimeState;
  event: DartsEventDescriptor;
  winnerProfileId?: string | null;
};

export type CountdownRules = {
  startScore: number;
  doubleOut: boolean;
};

export type AroundTheWorldRules = {
  skipAheadViaMultiples: boolean;
  ringRestriction: DartsRingRule;
};

export type KillerRules = {
  startingLives: number;
  activationRing: DartsRingRule;
};
