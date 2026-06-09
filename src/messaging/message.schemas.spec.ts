import {
  DistanceTableMessageSchema,
  MessageEnvelopeSchema,
  BaseMessageSchema,
} from '@/messaging/message.schemas';

describe('message schemas — tolerancia a la forma real del broker', () => {
  const distances = {
    HGW: {
      destinationCode: 'HGW',
      destinationName: 'Hogwarts',
      distance: 62763183,
      transportCost: 9351985,
      enabled: true,
    },
  };

  it('acepta la tabla de la central sin idpk/msgId (docs §6.2)', () => {
    const central = {
      cityId: 'central',
      type: 'distance-table',
      timestamp: '2026-06-09T00:00:00.000Z',
      data: { distances },
    };

    expect(MessageEnvelopeSchema.safeParse(central).success).toBe(true);

    const parsed = DistanceTableMessageSchema.safeParse(central);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.distances.HGW.enabled).toBe(true);
    }
  });

  it('acepta el formato REAL del central: body.routes (array) → data.distances', () => {
    // JSON real capturado de los logs del master (cost-update del central,
    // 2026-06-09 02:00:04). Trae las rutas como array bajo `body`, no `data`.
    const realCentral = {
      type: 'cost-update',
      idpk: '20be1d99-592e-4c85-b9ad-3024249ac079',
      msgId: '439ff90b-6ad2-495e-9933-c3c46b01f192',
      timestamp: '2026-06-09T02:00:04.219Z',
      body: {
        cityCode: 'TK3',
        cityName: 'Tokyo-3',
        routes: [
          {
            destinationCode: 'HGW',
            destinationName: 'Hogwarts',
            distance: 20394188,
            transportCost: 3000237,
            enabled: true,
          },
          {
            destinationCode: 'ROM',
            destinationName: 'Romdo',
            distance: 58801380,
            transportCost: 1037834,
            enabled: false,
          },
        ],
      },
    };

    const parsed = DistanceTableMessageSchema.safeParse(realCentral);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // body.cityCode → cityId (para el chequeo isOwnTable del subscriber).
      expect(parsed.data.cityId).toBe('TK3');
      // body.routes[] → data.distances{} keyed por destinationCode.
      expect(parsed.data.data.distances.HGW.enabled).toBe(true);
      expect(parsed.data.data.distances.HGW.distance).toBe(20394188);
      expect(parsed.data.data.distances.ROM.enabled).toBe(false);
    }
  });

  it('acepta timestamps que no son ISO 8601 estrictos', () => {
    const parsed = DistanceTableMessageSchema.safeParse({
      type: 'cost-update',
      timestamp: '2026-06-09 00:00:00',
      data: { distances },
    });
    expect(parsed.success).toBe(true);
  });

  it('sigue exigiendo idpk/msgId en mensajes que sí los traen (package-transit/ack)', () => {
    const missing = BaseMessageSchema.safeParse({
      type: 'ack',
      cityId: 'COR',
      timestamp: '2026-06-09T00:00:00.000Z',
    });
    expect(missing.success).toBe(false);
  });
});
