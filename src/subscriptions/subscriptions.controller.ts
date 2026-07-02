import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthUser } from '@/auth/auth-user.interface';
import { CreateSubscriptionRequest } from '@dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

// RF01
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSubscriptionRequest,
  ) {
    return this.subscriptions.create(user.sub, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.subscriptions.list(
      user,
      parseInt(page || '1', 10) || 1,
      parseInt(limit || '25', 10) || 25,
    );
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.subscriptions.get(user, id);
  }
}
