import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { PackagesService } from '@packages/packages.service';
import { CreatePackageDto, GetPackagesQuery } from '@dto/package.dto';

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
}
