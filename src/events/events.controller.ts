import { Controller, Get, MessageEvent, Sse } from '@nestjs/common';
import { Observable, from, map, merge } from 'rxjs';
import { EventsService } from './events.service';

// RF04
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    const recent$ = from(this.events.getRecent());
    return merge(recent$, this.events.asObservable()).pipe(
      map((event) => ({ data: event }) as MessageEvent),
    );
  }

  @Get('recent')
  recent() {
    return this.events.getRecent();
  }
}
