export interface CityCatalogEntry {
  code: string;
  name: string;
}

export const CITY_CATALOG: ReadonlyArray<CityCatalogEntry> = [
  { code: 'HGW', name: 'Hogwarts' },
  { code: 'COR', name: 'Coruscant' },
  { code: 'REE', name: 'Re-Estize' },
  { code: 'RAP', name: 'Rapture' },
  { code: 'RNC', name: 'Rancagua' },
  { code: 'TAL', name: 'Talca' },
  { code: 'LSN', name: 'Los Santos' },
  { code: 'MTI', name: 'Minas Tirith' },
  { code: 'SPR', name: 'Springfield' },
  { code: 'NNY', name: 'New New York' },
  { code: 'MET', name: 'Metropolis' },
  { code: 'KLD', name: "King's Landing" },
  { code: 'TAR', name: 'Tar Valon' },
  { code: 'ZIN', name: 'Zion' },
  { code: 'TK3', name: 'Tokyo-3' },
  { code: 'ROM', name: 'Romdo' },
  { code: 'TRA', name: 'Trantor' },
];

export const CITY_CODES: ReadonlyArray<string> = CITY_CATALOG.map(
  (c) => c.code,
);

export function getCityName(code: string): string | undefined {
  return CITY_CATALOG.find((c) => c.code === code)?.name;
}

export function getOwnCityId(): string {
  const code = process.env.CITY_ID;
  if (!code) {
    throw new Error(
      'CITY_ID environment variable is required (e.g. CITY_ID=HGW).',
    );
  }
  if (!CITY_CODES.includes(code)) {
    throw new Error(
      `CITY_ID="${code}" is not a recognized city code. Valid codes: ${CITY_CODES.join(', ')}.`,
    );
  }
  return code;
}
