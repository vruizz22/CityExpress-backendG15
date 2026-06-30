import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

// RF04
@Global()
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
