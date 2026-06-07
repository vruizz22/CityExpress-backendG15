import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { CurrentUser } from '@/auth/current-user.decorator';
import { AuthUser } from '@/auth/auth-user.interface';
import { CommitPaymentRequest, InitPaymentRequest } from '@dto/payment.dto';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // RF03
  @Post()
  init(@CurrentUser() user: AuthUser, @Body() body: InitPaymentRequest) {
    return this.payments.initPayment(user, body);
  }

  // RF03
  @Post('commit')
  @HttpCode(200)
  commit(@CurrentUser() user: AuthUser, @Body() body: CommitPaymentRequest) {
    return this.payments.commitPayment(user, body);
  }

  @Get(':id')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.getPaymentStatus(user, id);
  }
}
