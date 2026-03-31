import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PackagesService } from './packages.service';

@Controller('packages')
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  @Post()
  createPackage(@Body() data: any) {
    return this.packagesService.createPackage(data);
  }

  @Get()
  getPackages(@Query() query: any) {
    return this.packagesService.getPackages(query);
  }

  @Get(':id')
  getPackageById(@Param('id') id: string) {
    return this.packagesService.getPackageById(id);
  }
}
