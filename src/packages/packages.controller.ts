import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
} from '@nestjs/common';
import { PackagesService } from '@packages/packages.service';
import {
  CreatePackageDto,
  DeliverPackageBody,
  GetPackagesQuery,
} from '@dto/package.dto';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  createPackage(@Body() data: CreatePackageDto) {
    return this.packagesService.createPackage(data);
  }

  @Get()
  getPackages(@Query() query: GetPackagesQuery) {
    return this.packagesService.getPackages(query);
  }

  @Get(':id')
  getPackageById(@Param('id') id: string) {
    return this.packagesService.getPackageById(id);
  }

  @Post(':id/deliver')
  @HttpCode(200)
  deliverPackage(
    @Param('id') id: string,
    @Body() body: DeliverPackageBody = {},
    @Headers('idempotency-key') idempotencyHeader?: string,
  ) {
    const idpk = body?.idpk ?? idempotencyHeader;
    return this.packagesService.deliverPackage(id, idpk);
  }
}
