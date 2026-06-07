import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  it('devuelve jobsService:true cuando el servicio responde', async () => {
    const service = {
      isJobsServiceUp: jest.fn().mockResolvedValue(true),
    } as unknown as JobsService;
    const controller = new JobsController(service);
    await expect(controller.heartbeat()).resolves.toEqual({
      jobsService: true,
    });
  });

  it('devuelve jobsService:false cuando el servicio no responde', async () => {
    const service = {
      isJobsServiceUp: jest.fn().mockResolvedValue(false),
    } as unknown as JobsService;
    const controller = new JobsController(service);
    await expect(controller.heartbeat()).resolves.toEqual({
      jobsService: false,
    });
  });
});
