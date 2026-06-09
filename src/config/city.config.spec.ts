import {
  CITY_CATALOG,
  CITY_CODES,
  cityRoutingKey,
  getCityName,
  getOwnCityId,
  sameCity,
} from '@config/city.config';

describe('city.config', () => {
  const original = process.env.CITY_ID;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CITY_ID;
    } else {
      process.env.CITY_ID = original;
    }
  });

  it('CITY_CATALOG contains all 17 PDF cities', () => {
    expect(CITY_CATALOG).toHaveLength(17);
    expect(CITY_CODES).toEqual(expect.arrayContaining(['HGW', 'COR', 'TRA']));
  });

  it('getCityName resolves a known code', () => {
    expect(getCityName('HGW')).toBe('Hogwarts');
    expect(getCityName('XXX')).toBeUndefined();
  });

  it('getOwnCityId throws when CITY_ID is missing', () => {
    delete process.env.CITY_ID;
    expect(() => getOwnCityId()).toThrow(/CITY_ID/);
  });

  it('getOwnCityId throws when CITY_ID is unknown', () => {
    process.env.CITY_ID = 'XXX';
    expect(() => getOwnCityId()).toThrow(/not a recognized/);
  });

  it('getOwnCityId returns the configured city when valid', () => {
    process.env.CITY_ID = 'COR';
    expect(getOwnCityId()).toBe('COR');
  });

  it('cityRoutingKey siempre emite en minúscula (binding del broker)', () => {
    expect(cityRoutingKey('TK3')).toBe('city.tk3');
    expect(cityRoutingKey('HGW')).toBe('city.hgw');
    expect(cityRoutingKey('central')).toBe('city.central');
  });

  it('sameCity compara códigos sin importar la caja', () => {
    expect(sameCity('TK3', 'tk3')).toBe(true);
    expect(sameCity('hgw', 'HGW')).toBe(true);
    expect(sameCity('TK3', 'HGW')).toBe(false);
    expect(sameCity(undefined, 'TK3')).toBe(false);
    expect(sameCity('TK3', null)).toBe(false);
  });
});
