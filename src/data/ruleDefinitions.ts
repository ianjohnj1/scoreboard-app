export type RuleValueDefinition = {
  label?: string;
  explain: string;
};

export type RuleDefinition = {
  label: string;
  explain: string;
  values?: Record<string, RuleValueDefinition>;
};

export type RuleContextKey =
  | 'cricket'
  | 'cricket_backyard'
  | 'golf'
  | 'chip_off'
  | 'putt_vs_putt'
  | 'darts_countdown'
  | 'darts_around_the_world'
  | 'darts_killer'
  | 'pool_16_ball'
  | 'pool_8_ball';

export const RULE_DEFINITIONS: Record<RuleContextKey, Record<string, RuleDefinition>> = {
  cricket: {
    variant: {
      label: 'Match Type',
      explain: 'Choose whether the match is played with teams or in backyard rotation mode.',
      values: {
        classic: { label: 'Classic', explain: 'Two teams play standard innings-based cricket.' },
        backyard: { label: 'Backyard', explain: 'Players rotate through batting in an individual backyard format.' },
      },
    },
    no_noballs: {
      label: 'No No-Balls Rule',
      explain: 'Toggle whether no-balls are enforced during scoring.',
      values: {
        true: { label: 'On', explain: 'No-balls are tracked and penalized.' },
        false: { label: 'Off', explain: 'No-ball infractions are ignored.' },
      },
    },
    no_wides: {
      label: 'No Wide Rule',
      explain: 'Toggle whether wide deliveries are enforced during scoring.',
      values: {
        true: { label: 'On', explain: 'Wides are tracked and penalized.' },
        false: { label: 'Off', explain: 'Wide balls are ignored.' },
      },
    },
    max_overs: {
      label: 'Max Overs',
      explain: 'Sets the innings length before the batting side is finished.',
    },
    max_wickets: {
      label: 'Max Wickets',
      explain: 'Sets how many wickets can fall before the innings ends.',
    },
  },
  cricket_backyard: {
    variant: {
      label: 'Match Type',
      explain: 'Backyard cricket rotates individual players through the batting order instead of fixed teams.',
      values: {
        backyard: { label: 'Backyard', explain: 'Players cycle individually through the batting order.' },
      },
    },
    no_noballs: {
      label: 'No No-Balls Rule',
      explain: 'Toggle whether no-balls are enforced during scoring.',
      values: {
        true: { label: 'On', explain: 'No-balls are tracked and penalized.' },
        false: { label: 'Off', explain: 'No-ball infractions are ignored.' },
      },
    },
    no_wides: {
      label: 'No Wide Rule',
      explain: 'Toggle whether wide deliveries are enforced during scoring.',
      values: {
        true: { label: 'On', explain: 'Wides are tracked and penalized.' },
        false: { label: 'Off', explain: 'Wide balls are ignored.' },
      },
    },
  },
  golf: {
    variant: {
      label: 'Format',
      explain: 'Choose which golf-style game this match uses.',
      values: {
        classic: { label: 'Classic Golf', explain: 'Players record strokes across a course and lowest total wins.' },
        chip_off: { label: 'Chip Off', explain: 'Players score chip attempts over multiple rounds.' },
        putt_vs_putt: { label: 'PvP (Putt vs Putt)', explain: 'Two teams alternate putt attempts into a shared pool until all balls are gone.' },
      },
    },
    holes: {
      label: 'Holes',
      explain: 'Sets how many holes are played in the round.',
    },
  },
  chip_off: {
    variant: {
      label: 'Format',
      explain: 'Chip Off is the golf-family target-chipping variant.',
      values: {
        chip_off: { label: 'Chip Off', explain: 'Players chip for points over multiple rounds.' },
      },
    },
    team_play: {
      label: 'Team Play',
      explain: 'Split into two teams with a fixed lineup order. Turns alternate between teams (Team 1 Player 1, Team 2 Player 1, Team 1 Player 2, ...) and each shot\'s points add to the shooter\'s team total.',
      values: {
        true: { label: 'On', explain: 'Two teams compete, turns interleave across each team\'s lineup, and the higher team total wins.' },
        false: { label: 'Off', explain: 'Every player competes individually.' },
      },
    },
    balls_per_turn: {
      label: 'Balls Per Turn',
      explain: 'How many balls each player chips before the turn passes.',
    },
    total_rounds: {
      label: 'Total Rounds',
      explain: 'How many rounds the match lasts before final scoring.',
    },
    hazard_penalty: {
      label: 'Hazard Penalty (-1)',
      explain: 'Apply a penalty when a chip lands in a hazard zone.',
      values: {
        true: { label: 'On', explain: 'Hazard shots deduct a point.' },
        false: { label: 'Off', explain: 'Hazard shots do not deduct points.' },
      },
    },
  },
  putt_vs_putt: {
    variant: {
      label: 'Format',
      explain: 'PvP is a two-team putting duel played into a shared ball pool.',
      values: {
        putt_vs_putt: { label: 'PvP (Putt vs Putt)', explain: 'Teams alternate putt attempts, scoring one point for every holed putt.' },
      },
    },
    starting_balls_per_team: {
      label: 'Starting Balls',
      explain: 'How many balls are in the shared pool at match start.',
    },
  },
  darts_countdown: {
    variant: {
      label: 'Mode',
      explain: 'Countdown is the classic race from a starting score to exactly zero.',
      values: {
        countdown: { label: '501 / 301 Countdown', explain: 'Players count down to exactly zero, busting if they overshoot.' },
      },
    },
    start_score: {
      label: 'Start Score',
      explain: 'The score each player begins with before counting down.',
    },
    double_out: {
      label: 'Enforce Double-Out',
      explain: 'Require the winning throw to finish on a double segment.',
      values: {
        true: { label: 'On', explain: 'Players must finish exactly on a double.' },
        false: { label: 'Off', explain: 'Any exact finishing segment wins the leg.' },
      },
    },
  },
  darts_around_the_world: {
    variant: {
      label: 'Mode',
      explain: 'Around the World progresses through target numbers in sequence.',
      values: {
        around_the_world: { label: 'Around the World', explain: 'Players advance through ordered targets until they finish the board.' },
      },
    },
    skip_ahead_via_multiples: {
      label: 'Skip Ahead via Multiples',
      explain: 'Allow doubles or triples to move a player forward by more than one target.',
      values: {
        true: { label: 'On', explain: 'Higher multipliers can skip extra targets.' },
        false: { label: 'Off', explain: 'Each successful hit advances only one target.' },
      },
    },
    ring_restriction: {
      label: 'Ring Restriction',
      explain: 'Restrict which ring types count as valid hits.',
      values: {
        any_segment: { label: 'Any Segment', explain: 'Singles, doubles, and triples all count.' },
        doubles_only: { label: 'Doubles Only', explain: 'Only doubles count as valid hits.' },
        triples_only: { label: 'Triples Only', explain: 'Only triples count as valid hits.' },
      },
    },
  },
  darts_killer: {
    variant: {
      label: 'Mode',
      explain: 'Killer is an elimination game with activation and target-hunting phases.',
      values: {
        killer: { label: 'Killer', explain: 'Players activate as killers, then attack opponents by hitting assigned targets.' },
      },
    },
    starting_lives: {
      label: 'Starting Lives',
      explain: 'How many lives each player starts with before elimination.',
    },
    killer_activation_ring: {
      label: 'Target Ring to Become Killer',
      explain: 'Choose which ring a player must hit to activate killer status.',
      values: {
        any_segment: { label: 'Any Segment', explain: 'Any valid hit activates killer status.' },
        doubles_only: { label: 'Doubles Only', explain: 'Players must hit a double to activate killer status.' },
        triples_only: { label: 'Triples Only', explain: 'Players must hit a triple to activate killer status.' },
      },
    },
  },
  pool_16_ball: {
    variant: {
      label: 'Format',
      explain: 'Open-table pub rules: pot any of your own group in any pocket, no called shots.',
      values: {
        '16_ball': { label: '16 Ball Pool', explain: 'The first ball legally potted assigns Bigs (9-15) or Smalls (1-7) to that side; the table stays open until then.' },
      },
    },
    team_play: {
      label: 'Team Pairs',
      explain: 'Play as two pairs instead of one player per side. Partners alternate strictly by lineup order each time the turn returns to their side.',
      values: {
        true: { label: 'On', explain: 'Two teams of pairs compete, alternating shooters by lineup order.' },
        false: { label: 'Off', explain: 'One player per side.' },
      },
    },
  },
  pool_8_ball: {
    variant: {
      label: 'Format',
      explain: 'Call-shot rules: call your ball and pocket before every shot (self-officiated - the app tracks pots and turns, not the call itself).',
      values: {
        '8_ball': { label: '8 Ball', explain: 'Same potting and group rules as 16 Ball, played under call-shot etiquette.' },
      },
    },
    team_play: {
      label: 'Team Pairs',
      explain: 'Play as two pairs instead of one player per side. Partners alternate strictly by lineup order each time the turn returns to their side.',
      values: {
        true: { label: 'On', explain: 'Two teams of pairs compete, alternating shooters by lineup order.' },
        false: { label: 'Off', explain: 'One player per side.' },
      },
    },
  },
};

export function getRuleContextKey(sport: string, houseRules: Record<string, unknown> | null | undefined): RuleContextKey | null {
  const variant = String(houseRules?.variant || '');

  if (sport === 'cricket') {
    return variant === 'backyard' ? 'cricket_backyard' : 'cricket';
  }

  if (sport === 'golf') {
    if (variant === 'chip_off') return 'chip_off';
    if (variant === 'putt_vs_putt') return 'putt_vs_putt';
    return 'golf';
  }

  if (sport === 'darts') {
    if (variant === 'around_the_world') return 'darts_around_the_world';
    if (variant === 'killer') return 'darts_killer';
    return 'darts_countdown';
  }

  if (sport === 'pool') {
    if (variant === '8_ball') return 'pool_8_ball';
    if (variant === '16_ball') return 'pool_16_ball';
    return null;
  }

  return null;
}

export function getRuleDefinitionsForMatch(sport: string, houseRules: Record<string, unknown> | null | undefined) {
  const contextKey = getRuleContextKey(sport, houseRules);
  return contextKey ? RULE_DEFINITIONS[contextKey] : null;
}

export function getRuleDefinition(
  sport: string,
  houseRules: Record<string, unknown> | null | undefined,
  ruleKey: string
) {
  return getRuleDefinitionsForMatch(sport, houseRules)?.[ruleKey] ?? null;
}

export function formatRuleValue(definition: RuleDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not set';
  const normalized = String(value);
  return definition.values?.[normalized]?.label ?? normalized;
}

export function getDisplayableRules(sport: string, houseRules: Record<string, unknown> | null | undefined) {
  const definitions = getRuleDefinitionsForMatch(sport, houseRules);
  if (!definitions || !houseRules) return [];

  return Object.entries(houseRules)
    .filter(([key, value]) => definitions[key] && value !== null && value !== undefined)
    .map(([key, value]) => ({
      key,
      definition: definitions[key],
      value,
      valueLabel: formatRuleValue(definitions[key], value),
    }));
}
