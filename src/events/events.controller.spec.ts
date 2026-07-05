import { firstValueFrom } from 'rxjs';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { FeedEvent } from './feed-event.types';

function makeReq() {
  const setHeader = jest.fn();
  return { req: { res: { setHeader } } as never, setHeader };
}

describe('EventsController (RF04)', () => {
  it('desactiva el buffering del proxy (X-Accel-Buffering: no)', () => {
    const controller = new EventsController(new EventsService());
    const { req, setHeader } = makeReq();

    controller.stream(req);

    expect(setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('reemite los eventos recientes al conectar', async () => {
    const service = new EventsService();
    service.publish({ type: 'package-created', packageId: 'p1' });
    const controller = new EventsController(service);
    const { req } = makeReq();

    const first = await firstValueFrom(controller.stream(req));

    expect((first.data as FeedEvent).packageId).toBe('p1');
  });
});
