import { Controller, Get } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  getRoutes() {
    const data = this.routesService.getRoutes();
    return { data };
  }
}
