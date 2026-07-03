import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { FeedEvent, FeedEventInput } from './feed-event.types';

// RF04
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private readonly stream = new Subject<FeedEvent>();
  private readonly recent: FeedEvent[] = [];
  private readonly maxRecent = Number(process.env.FEED_RECENT_MAX ?? 50);

  publish(event: FeedEventInput): FeedEvent {
    const full: FeedEvent = { timestamp: new Date().toISOString(), ...event };
    this.recent.push(full);
    if (this.recent.length > this.maxRecent) {
      this.recent.shift();
    }
    this.stream.next(full);
    this.logger.debug(`feed: ${full.type} ${full.packageId ?? ''}`.trim());
    return full;
  }

  asObservable(): Observable<FeedEvent> {
    return this.stream.asObservable();
  }

  getRecent(): FeedEvent[] {
    return [...this.recent];
  }
}
