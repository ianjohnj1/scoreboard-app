export type StatDefinition = {
  label: string;
  shortLabel?: string;
  explain: string;
};

export const STAT_DEFINITIONS: Record<string, StatDefinition> = {
  wins: {
    label: 'Wins',
    shortLabel: 'WINS',
    explain: 'Total matches won in this sport or stat family.',
  },
  holed_putts_total: {
    label: 'Holed Putts Total',
    shortLabel: 'Career Holes',
    explain: 'Career total of successfully holed putts in PvP matches.',
  },
  career_pct_holed: {
    label: 'Career % Holed',
    shortLabel: '% Holed',
    explain: 'Career success rate calculated as holed putts divided by total putt attempts.',
  },
  clutch_putts: {
    label: 'Clutch Putts',
    shortLabel: 'Clutch',
    explain: 'Number of PvP tie-breakers won for your team.',
  },
};

export function getStatDefinition(statKey: string) {
  return STAT_DEFINITIONS[statKey] ?? null;
}
