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

export type PriorityClass = 'low' | 'medium' | 'high';

// RF03
export const PRIORITY_FACTORS: Record<PriorityClass, number> = {
  low: 0.5,
  medium: 1,
  high: 2.5,
};

// RF03 — niveles AMQP para el sistema de prioridades de cola de RabbitMQ
// (enunciado E3: low=1, medium=2, high=3).
export const PRIORITY_LEVELS: Record<PriorityClass, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// RF02
export const INSURANCE_PREMIUM_RATE = 0.05;

export function getPriorityFactor(priorityClass: string): number {
  return PRIORITY_FACTORS[priorityClass as PriorityClass] ?? 1;
}

// RF03 — priorityClass desconocido cae a 'medium' (2), igual que el factor.
export function getPriorityLevel(priorityClass: string): number {
  return PRIORITY_LEVELS[priorityClass as PriorityClass] ?? 2;
}

// RF01/RF02/RF03
export function priceWithSurcharges(
  baseAmount: number,
  opts: { priorityClass: string; insured: boolean },
): number {
  const withPriority = baseAmount * getPriorityFactor(opts.priorityClass);
  const withInsurance = opts.insured
    ? withPriority * (1 + INSURANCE_PREMIUM_RATE)
    : withPriority;
  return Math.round(withInsurance);
}
