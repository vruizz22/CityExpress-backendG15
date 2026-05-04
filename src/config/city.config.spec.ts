import {
  CITY_CATALOG,
  CITY_CODES,
  getCityName,
  getOwnCityId,
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
});
