import { EventsService } from './events.service';
import { FeedEvent } from './feed-event.types';

describe('EventsService (RF04)', () => {
  it('publica un evento, le pone timestamp y lo guarda en recientes', () => {
    const service = new EventsService();
    const ev = service.publish({ type: 'package-created', packageId: 'pkg-1' });

    expect(ev.type).toBe('package-created');
    expect(ev.timestamp).toEqual(expect.any(String));
    expect(service.getRecent()).toHaveLength(1);
    expect(service.getRecent()[0].packageId).toBe('pkg-1');
  });

  it('emite los eventos a los suscriptores del stream en vivo', () => {
    const service = new EventsService();
    const received: FeedEvent[] = [];
    service.asObservable().subscribe((e) => received.push(e));

    service.publish({ type: 'package-received', packageId: 'pkg-2' });
    service.publish({ type: 'package-redirected', packageId: 'pkg-3' });

    expect(received).toHaveLength(2);
    expect(received.map((e) => e.type)).toEqual([
      'package-received',
      'package-redirected',
    ]);
  });

  it('limita el buffer de recientes a FEED_RECENT_MAX', () => {
    process.env.FEED_RECENT_MAX = '3';
    const service = new EventsService();

    for (let i = 0; i < 5; i++) {
      service.publish({ type: 'package-created', packageId: `pkg-${i}` });
    }

    const recent = service.getRecent();
    expect(recent).toHaveLength(3);
    expect(recent.map((e) => e.packageId)).toEqual(['pkg-2', 'pkg-3', 'pkg-4']);
    delete process.env.FEED_RECENT_MAX;
  });

  it('preserva los campos flat del evento (origin/destination/amount, status/reason)', () => {
    const service = new EventsService();
    const ev = service.publish({
      type: 'package-status',
      packageId: 'pkg-5',
      status: 'expired',
      reason: 'inhabilitada',
      origin: 'HGW',
      destination: 'COR',
      amount: 1500,
    });

    expect(ev).toMatchObject({
      type: 'package-status',
      packageId: 'pkg-5',
      status: 'expired',
      reason: 'inhabilitada',
      origin: 'HGW',
      destination: 'COR',
      amount: 1500,
    });
  });

  it('getRecent devuelve una copia (no la referencia interna)', () => {
    const service = new EventsService();
    service.publish({ type: 'insurance-charged', packageId: 'pkg-9' });
    const snapshot = service.getRecent();
    snapshot.push({ type: 'package-created', timestamp: 'x' });
    expect(service.getRecent()).toHaveLength(1);
  });
});
