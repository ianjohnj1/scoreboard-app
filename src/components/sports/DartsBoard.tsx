import {
  DARTBOARD_CENTER,
  DARTBOARD_ORDER,
  DARTBOARD_RADIUS,
  RING_RADII,
  describeWedgePath,
  getSegmentAngles,
  getSegmentKey,
  getSegmentOverlayAnchor,
  polarToCartesian,
} from '../../lib/darts/board';
import type { DartsHighlightRole, DartsHighlightState, DartsPendingMenu, DartsVariant } from '../../lib/darts/types';

type DartsBoardProps = {
  mode: DartsVariant;
  disabled?: boolean;
  pendingMenu: DartsPendingMenu | null;
  highlightState: DartsHighlightState;
  onSegmentTap: (segmentNumber: number, anchor: { x: number; y: number }) => void;
  onBullTap: () => void;
  onDoubleBullTap: () => void;
  onMultiplierSelect: (multiplier: 1 | 2 | 3) => void;
  onDismissMultiplier: () => void;
};

function hasRole(roles: DartsHighlightRole[] | undefined, role: DartsHighlightRole) {
  return Boolean(roles?.includes(role));
}

function getSegmentFill(base: string, roles: DartsHighlightRole[] | undefined) {
  if (hasRole(roles, 'active')) return '#22d3ee';
  if (hasRole(roles, 'opponent')) return '#f97316';
  if (hasRole(roles, 'self')) return '#38bdf8';
  if (hasRole(roles, 'eliminated')) return '#6b7280';
  return base;
}

function getSegmentOpacity(roles: DartsHighlightRole[] | undefined) {
  if (hasRole(roles, 'dimmed')) return 0.2;
  if (hasRole(roles, 'eliminated')) return 0.35;
  return 1;
}

function getTransform(roles: DartsHighlightRole[] | undefined) {
  return hasRole(roles, 'recent') || hasRole(roles, 'active') ? 'scale(1.02)' : 'scale(1)';
}

function getPulseClass(roles: DartsHighlightRole[] | undefined) {
  return hasRole(roles, 'recent') || hasRole(roles, 'active') ? 'animate-dartboard-pulse' : '';
}

export default function DartsBoard({
  mode,
  disabled = false,
  pendingMenu,
  highlightState,
  onSegmentTap,
  onBullTap,
  onDoubleBullTap,
  onMultiplierSelect,
  onDismissMultiplier,
}: DartsBoardProps) {
  const menuLeft = pendingMenu ? `${(pendingMenu.x / 400) * 100}%` : '50%';
  const menuTop = pendingMenu ? `${(pendingMenu.y / 400) * 100}%` : '50%';

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px]">
      <svg viewBox="0 0 400 400" className="h-full w-full drop-shadow-[0_16px_32px_rgba(0,0,0,0.35)]">
        <circle cx={DARTBOARD_CENTER} cy={DARTBOARD_CENTER} r={DARTBOARD_RADIUS} fill="#111827" />

        {DARTBOARD_ORDER.map((segment, index) => {
          const { startAngle, endAngle, centerAngle } = getSegmentAngles(index);
          const segmentKey = getSegmentKey(segment);
          const roles = highlightState[segmentKey];
          const labelPoint = polarToCartesian(DARTBOARD_CENTER, DARTBOARD_CENTER, 205, centerAngle);
          const outerSinglePath = describeWedgePath(RING_RADII.tripleOuter, RING_RADII.singleOuter, startAngle, endAngle);
          const triplePath = describeWedgePath(RING_RADII.tripleInner, RING_RADII.tripleOuter, startAngle, endAngle);
          const innerSinglePath = describeWedgePath(RING_RADII.outerBull, RING_RADII.singleInner, startAngle, endAngle);
          const doublePath = describeWedgePath(RING_RADII.doubleInner, RING_RADII.doubleOuter, startAngle, endAngle);
          const interactionPath = describeWedgePath(RING_RADII.outerBull, RING_RADII.doubleOuter, startAngle, endAngle);
          const anchor = getSegmentOverlayAnchor(index);

          return (
            <g key={segment} data-segment={segmentKey} className={`dartboard-segment is-${mode}`}>
              {[{ path: outerSinglePath, fill: index % 2 === 0 ? '#f8fafc' : '#111827' },
                { path: innerSinglePath, fill: index % 2 === 0 ? '#f8fafc' : '#111827' },
                { path: triplePath, fill: index % 2 === 0 ? '#ef4444' : '#16a34a' },
                { path: doublePath, fill: index % 2 === 0 ? '#ef4444' : '#16a34a' }].map((ring, ringIndex) => (
                <path
                  key={`${segment}-${ringIndex}`}
                  d={ring.path}
                  className={`dartboard-zone ${getPulseClass(roles)} ${roles?.map(role => `is-${role}`).join(' ') || ''}`}
                  data-segment-key={segmentKey}
                  data-segment-number={segment}
                  fill={getSegmentFill(ring.fill, roles)}
                  opacity={getSegmentOpacity(roles)}
                  stroke="#0f172a"
                  strokeWidth="1.2"
                  style={{
                    transition: 'transform 180ms ease, opacity 180ms ease, fill 180ms ease',
                    transform: getTransform(roles),
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                  }}
                />
              ))}

              <path
                d={interactionPath}
                fill="transparent"
                stroke="transparent"
                className="cursor-pointer"
                onClick={() => {
                  if (!disabled) {
                    onSegmentTap(segment, anchor);
                  }
                }}
              />

              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none fill-charcoal-50 text-[16px] font-black"
              >
                {segment}
              </text>
            </g>
          );
        })}

        <circle
          cx={DARTBOARD_CENTER}
          cy={DARTBOARD_CENTER}
          r={RING_RADII.outerBull}
          fill={getSegmentFill('#16a34a', highlightState.bull)}
          opacity={getSegmentOpacity(highlightState.bull)}
          stroke="#0f172a"
          strokeWidth="1.5"
          className={`cursor-pointer dartboard-zone ${getPulseClass(highlightState.bull)} ${highlightState.bull?.map(role => `is-${role}`).join(' ') || ''}`}
          style={{
            transition: 'transform 180ms ease, opacity 180ms ease, fill 180ms ease',
            transform: getTransform(highlightState.bull),
            transformBox: 'fill-box',
            transformOrigin: 'center',
          }}
          onClick={() => {
            if (!disabled) onBullTap();
          }}
        />
        <circle
          cx={DARTBOARD_CENTER}
          cy={DARTBOARD_CENTER}
          r={RING_RADII.innerBull}
          fill={getSegmentFill('#ef4444', highlightState.double_bull)}
          opacity={getSegmentOpacity(highlightState.double_bull)}
          stroke="#0f172a"
          strokeWidth="1.5"
          className={`cursor-pointer dartboard-zone ${getPulseClass(highlightState.double_bull)} ${highlightState.double_bull?.map(role => `is-${role}`).join(' ') || ''}`}
          style={{
            transition: 'transform 180ms ease, opacity 180ms ease, fill 180ms ease',
            transform: getTransform(highlightState.double_bull),
            transformBox: 'fill-box',
            transformOrigin: 'center',
          }}
          onClick={event => {
            event.stopPropagation();
            if (!disabled) onDoubleBullTap();
          }}
        />
      </svg>

      {pendingMenu && (
        <>
          <button
            type="button"
            aria-label="Dismiss multiplier menu"
            className="absolute inset-0 cursor-default"
            onClick={onDismissMultiplier}
          />
          <div
            className="animate-dartboard-menu absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-charcoal-600 bg-charcoal-900/95 p-2 shadow-2xl backdrop-blur transition-all duration-200"
            style={{
              left: menuLeft,
              top: menuTop,
              opacity: 1,
              transform: 'translate(-50%, -50%) scale(1)',
            }}
          >
            <div className="flex items-center gap-2">
              {[{ label: 'Single', value: 1 }, { label: 'Double', value: 2 }, { label: 'Triple', value: 3 }].map(option => (
                <button
                  key={option.value}
                  type="button"
                  className="rounded-xl border border-charcoal-600 bg-charcoal-800 px-3 py-2 text-xs font-black uppercase tracking-wider text-charcoal-100 transition-all hover:border-accent-500 hover:text-accent-200"
                  onClick={() => onMultiplierSelect(option.value as 1 | 2 | 3)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
