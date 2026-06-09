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
