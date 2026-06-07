import {
  computeAmount,
  dimensionsValid,
  getFPrice,
  MAX_AMOUNT,
  MIN_AMOUNT,
} from './pricing';

describe('pricing', () => {
  describe('dimensionsValid', () => {
    it('acepta dimensiones positivas que suman <= 3000', () => {
      expect(dimensionsValid(1000, 1000, 1000)).toBe(true);
      expect(dimensionsValid(10, 20, 30)).toBe(true);
    });

    it('rechaza suma > 3000', () => {
      expect(dimensionsValid(1000, 1000, 1001)).toBe(false);
    });

    it('rechaza dimensiones no positivas', () => {
      expect(dimensionsValid(0, 10, 10)).toBe(false);
      expect(dimensionsValid(-1, 10, 10)).toBe(false);
    });
  });

  describe('computeAmount', () => {
    const base = { height: 100, width: 100, depth: 100, fPrice: 1 };

    it('aplica el piso de $5000', () => {
      const amount = computeAmount({ ...base, routeMetricCost: 1 });
      expect(amount).toBe(MIN_AMOUNT);
    });

    it('aplica el techo de $100000', () => {
      const amount = computeAmount({ ...base, routeMetricCost: 10_000_000 });
      expect(amount).toBe(MAX_AMOUNT);
    });

    it('calcula el valor intermedio con la fórmula 0.01*(h+w+d)*cost*fPrice', () => {
      const amount = computeAmount({ ...base, routeMetricCost: 10_000 });
      expect(amount).toBe(30_000);
    });

    it('escala con fPrice', () => {
      const amount = computeAmount({
        ...base,
        routeMetricCost: 10_000,
        fPrice: 2,
      });
      expect(amount).toBe(60_000);
    });
  });

  describe('getFPrice', () => {
    const original = process.env.F_PRICE;
    afterEach(() => {
      process.env.F_PRICE = original;
    });

    it('clamp a [0.5, 2]', () => {
      process.env.F_PRICE = '5';
      expect(getFPrice()).toBe(2);
      process.env.F_PRICE = '0.1';
      expect(getFPrice()).toBe(0.5);
      process.env.F_PRICE = '1.5';
      expect(getFPrice()).toBe(1.5);
    });

    it('default 1 si no es numérico', () => {
      process.env.F_PRICE = 'abc';
      expect(getFPrice()).toBe(1);
    });
  });
});
