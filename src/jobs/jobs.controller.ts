import { Controller, Get } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  // El front (RNF04) consume GET /heartbeat (vía API Gateway) para mostrar el
  // indicador de disponibilidad del servicio de jobs/workers. Siempre responde
  // 200; el booleano indica si el job-master está arriba.
  @Get('heartbeat')
  async heartbeat(): Promise<{ jobsService: boolean }> {
    return { jobsService: await this.jobsService.isJobsServiceUp() };
  }
}
