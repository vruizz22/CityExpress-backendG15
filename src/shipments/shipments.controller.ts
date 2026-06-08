import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthUser } from '@/auth/auth-user.interface';
import { CreateShipmentRequest, QuoteRequest } from '@dto/shipment.dto';
import { ShipmentsService } from './shipments.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  // RF02
  @Post('quotes')
  @HttpCode(200)
  quote(@Body() body: QuoteRequest) {
    return this.shipments.quote(body);
  }

  // RF01
  @Post('shipments')
  create(@CurrentUser() user: AuthUser, @Body() body: CreateShipmentRequest) {
    return this.shipments.createShipment(user.sub, body);
  }

  // RF05
  @Get('shipments')
  list(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shipments.listShipments(
      user,
      parseInt(page || '1', 10) || 1,
      parseInt(limit || '25', 10) || 25,
    );
  }

  @Get('shipments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shipments.getShipment(user, id);
  }
}
