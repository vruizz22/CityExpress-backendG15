import { Controller, Get, MessageEvent, Req, Sse } from '@nestjs/common';
import { Request } from 'express';
import { Observable, from, interval, map, merge } from 'rxjs';
import { EventsService } from './events.service';

const HEARTBEAT_MS = Number(process.env.FEED_HEARTBEAT_MS ?? 25000);

// RF04
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('stream')
  stream(@Req() req: Request): Observable<MessageEvent> {
    req.res?.setHeader('X-Accel-Buffering', 'no');
    const recent$ = from(this.events.getRecent());
    const feed$ = merge(recent$, this.events.asObservable()).pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: 'ping' }) as MessageEvent),
    );
    return merge(feed$, heartbeat$);
  }

  @Get('recent')
  recent() {
    return this.events.getRecent();
  }
}
