import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TickRequestSchema } from '@dto/subscription.dto';
import { SubscriptionEngineService } from './subscription-engine.service';
import { SubscriptionTickGuard } from './subscription-tick.guard';

// RF01
@UseGuards(SubscriptionTickGuard)
@Controller('subscriptions')
export class SubscriptionTickController {
  constructor(private readonly engine: SubscriptionEngineService) {}

  @Post(':id/tick')
  tick(@Param('id') id: string, @Body() body: unknown) {
    const parsed = TickRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('tickNumber inválido');
    }
    return this.engine.runTick(id, parsed.data.tickNumber);
  }
}
