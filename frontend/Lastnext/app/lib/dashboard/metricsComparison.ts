/**
 * Reusable helpers for dashboard comparisons (MoM, YoY, safe division).
 */

export type ComparisonDirection = 'up' | 'down' | 'flat' | 'new';

export interface RelativeChangeResult {
  direction: ComparisonDirection;
  /** Human-readable primary line, e.g. "+12.4%" or "Up from 0" */
  headline: string;
  /** Optional detail when % is not shown */
  detail?: string;
}

const EPS = 1e-9;

export function clampNonNegative(n: number): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x;
}

/**
 * Relative percent change: ((current - previous) / previous) * 100.
 * Returns null when previous === 0 (caller should use zero-safe copy).
 */
export function relativePercentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Absolute difference (e.g. percentage points for rates). */
export function absoluteDelta(current: number, previous: number): number {
  return current - previous;
}

/**
 * Format a signed percentage with one decimal, no sign duplication.
 */
export function formatSignedPercent(value: number, decimals = 1): string {
  const abs = Math.abs(value).toFixed(decimals);
  if (value > EPS) return `+${abs}%`;
  if (value < -EPS) return `-${abs}%`;
  return '0%';
}

/**
 * Format signed percentage points (for completion rate MoM).
 */
export function formatSignedPoints(value: number, decimals = 1): string {
  const abs = Math.abs(value).toFixed(decimals);
  if (value > EPS) return `+${abs} pts`;
  if (value < -EPS) return `-${abs} pts`;
  return '0 pts';
}

function directionFromDelta(delta: number): 'up' | 'down' | 'flat' {
  if (delta > EPS) return 'up';
  if (delta < -EPS) return 'down';
  return 'flat';
}

/**
 * Count-like metric: show % vs previous when previous > 0; safe messaging when previous === 0.
 */
export function describeRelativeCountChange(
  current: number,
  previous: number
): RelativeChangeResult {
  const cur = clampNonNegative(current);
  const prev = clampNonNegative(previous);

  if (prev === 0) {
    if (cur === 0) {
      return { direction: 'flat', headline: 'Same as prior period' };
    }
    return {
      direction: 'new',
      headline: `+${Math.round(cur).toLocaleString('en-US')} vs 0 prior`,
      detail: 'No prior-period baseline for % change',
    };
  }

  const pct = relativePercentChange(cur, prev)!;
  const dir = directionFromDelta(cur - prev);
  return {
    direction: dir === 'flat' ? 'flat' : dir,
    headline: formatSignedPercent(pct),
  };
}

/**
 * Rate / percentage metric: prefer percentage-point delta; optional relative % of previous rate when previous > 0.
 */
export function describeRateChange(
  currentRate: number,
  previousRate: number
): RelativeChangeResult {
  const cur = clampNonNegative(currentRate);
  const prev = clampNonNegative(previousRate);
  const pts = absoluteDelta(cur, prev);
  const dir = directionFromDelta(pts);

  if (prev === 0 && cur === 0) {
    return { direction: 'flat', headline: 'Same as prior period' };
  }

  if (prev === 0) {
    return {
      direction: 'new',
      headline: `+${cur.toFixed(1)} pts`,
      detail: 'Was 0% in prior period',
    };
  }

  return {
    direction: dir === 'flat' ? 'flat' : dir,
    headline: formatSignedPoints(pts),
  };
}

/**
 * Signed quantity (e.g. variance): standard % change vs previous when previous !== 0.
 * When previous === 0, avoids division and uses a short delta headline.
 */
export function describeSignedRelativeChange(
  current: number,
  previous: number
): RelativeChangeResult {
  const curN = typeof current === 'number' && Number.isFinite(current) ? current : Number(current);
  const prevN =
    typeof previous === 'number' && Number.isFinite(previous) ? previous : Number(previous);

  if (!Number.isFinite(curN) || !Number.isFinite(prevN)) {
    return {
      direction: 'flat',
      headline: '—',
      detail: 'Unable to compare non-numeric values',
    };
  }

  if (Math.abs(prevN) < EPS) {
    if (Math.abs(curN) < EPS) {
      return { direction: 'flat', headline: 'Same as prior period' };
    }
    const dir = curN > 0 ? 'up' : 'down';
    const head =
      Math.abs(curN) >= 1e6
        ? `${curN >= 0 ? '+' : ''}${curN.toExponential(1)} vs 0 prior`
        : `${curN >= 0 ? '+' : ''}${curN.toFixed(0)} vs 0 prior`;
    return {
      direction: dir,
      headline: head,
      detail: 'No prior-period baseline for % change',
    };
  }

  const pct = relativePercentChange(curN, prevN)!;
  const dir = directionFromDelta(curN - prevN);
  return {
    direction: dir === 'flat' ? 'flat' : dir,
    headline: formatSignedPercent(pct),
  };
}
