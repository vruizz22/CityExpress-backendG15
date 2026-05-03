import { Controller, Get } from '@nestjs/common';
import { RoutesService } from '@routes/routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  getRoutes() {
    return this.routesService.getRoutes();
  }
}
