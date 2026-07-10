import type { DartsBoardTarget, DartsRing, DartsThrow } from './types';

export const DARTBOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export const DARTBOARD_CENTER = 200;
export const DARTBOARD_RADIUS = 190;

export const RING_RADII = {
  doubleOuter: 190,
  doubleInner: 165,
  singleOuter: 165,
  tripleOuter: 115,
  tripleInner: 92,
  singleInner: 92,
  outerBull: 28,
  innerBull: 12,
};

export function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

export function describeWedgePath(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const outerStart = polarToCartesian(DARTBOARD_CENTER, DARTBOARD_CENTER, outerRadius, endAngle);
  const outerEnd = polarToCartesian(DARTBOARD_CENTER, DARTBOARD_CENTER, outerRadius, startAngle);
  const innerStart = polarToCartesian(DARTBOARD_CENTER, DARTBOARD_CENTER, innerRadius, startAngle);
  const innerEnd = polarToCartesian(DARTBOARD_CENTER, DARTBOARD_CENTER, innerRadius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

export function getSegmentAngles(index: number) {
  const sweep = 360 / DARTBOARD_ORDER.length;
  const startAngle = index * sweep;
  const endAngle = startAngle + sweep;
  return { startAngle, endAngle, centerAngle: startAngle + sweep / 2 };
}

export function getSegmentOverlayAnchor(index: number) {
  const { centerAngle } = getSegmentAngles(index);
  return polarToCartesian(
    DARTBOARD_CENTER,
    DARTBOARD_CENTER,
    (RING_RADII.singleInner + RING_RADII.singleOuter) / 2,
    centerAngle
  );
}

export function getRingMultiplier(ring: DartsRing): 0 | 1 | 2 | 3 {
  switch (ring) {
    case 'double':
    case 'double_bull':
      return 2;
    case 'triple':
      return 3;
    case 'single':
    case 'bull':
      return 1;
    case 'miss':
    default:
      return 0;
  }
}

export function createThrow(target: DartsBoardTarget, ring: DartsRing): DartsThrow {
  if (target === 'miss' || ring === 'miss') {
    return {
      segment: 'miss',
      ring: 'miss',
      multiplier: 0,
      baseValue: 0,
      scoredPoints: 0,
      label: 'Miss',
    };
  }

  if (target === 'bull') {
    return {
      segment: 'bull',
      ring: 'bull',
      multiplier: 1,
      baseValue: 25,
      scoredPoints: 25,
      label: 'Bull',
    };
  }

  if (target === 'double_bull') {
    return {
      segment: 'double_bull',
      ring: 'double_bull',
      multiplier: 2,
      baseValue: 25,
      scoredPoints: 50,
      label: 'D-Bull',
    };
  }

  const multiplier = getRingMultiplier(ring);
  const scoredPoints = target * multiplier;
  const ringPrefix = ring === 'single' ? 'S' : ring === 'double' ? 'D' : 'T';

  return {
    segment: target,
    ring,
    multiplier,
    baseValue: target,
    scoredPoints,
    label: `${ringPrefix}${target}`,
  };
}

export function getSegmentKey(target: DartsBoardTarget) {
  if (target === 'bull') return 'bull';
  if (target === 'double_bull') return 'double_bull';
  if (target === 'miss') return 'miss';
  return `segment_${target}`;
}

export function ringMatchesRule(ring: DartsRing, rule: 'any_segment' | 'doubles_only' | 'triples_only') {
  if (rule === 'any_segment') return ring === 'single' || ring === 'double' || ring === 'triple';
  if (rule === 'doubles_only') return ring === 'double';
  return ring === 'triple';
}
