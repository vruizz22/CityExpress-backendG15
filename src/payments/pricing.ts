export const MIN_AMOUNT = 5000;
export const MAX_AMOUNT = 100000;
export const MAX_LINEAR_CM = 3000; // RF01

export function getFPrice(): number {
  const raw = Number(process.env.F_PRICE ?? '1');
  if (!Number.isFinite(raw)) return 1;
  return Math.min(2, Math.max(0.5, raw));
}

export interface PriceInput {
  height: number;
  width: number;
  depth: number;
  routeMetricCost: number;
  fPrice: number;
}

export function dimensionsValid(
  height: number,
  width: number,
  depth: number,
): boolean {
  return (
    [height, width, depth].every((d) => Number.isFinite(d) && d > 0) &&
    height + width + depth <= MAX_LINEAR_CM
  );
}

export function computeAmount(input: PriceInput): number {
  const { height, width, depth, routeMetricCost, fPrice } = input;
  const linear = height + width + depth;
  const raw = 0.01 * linear * routeMetricCost * fPrice;
  const clamped = Math.max(MIN_AMOUNT, Math.min(MAX_AMOUNT, raw));
  return Math.round(clamped);
}
