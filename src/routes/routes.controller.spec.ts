import { Test, TestingModule } from '@nestjs/testing';
import { RoutesController } from '@routes/routes.controller';
import { RoutesService } from '@routes/routes.service';

describe('RoutesController', () => {
  let controller: RoutesController;
  let service: { getRoutes: jest.Mock };

  beforeEach(async () => {
    service = { getRoutes: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoutesController],
      providers: [{ provide: RoutesService, useValue: service }],
    }).compile();
    controller = module.get<RoutesController>(RoutesController);
  });

  it('GET /routes delegates to RoutesService.getRoutes', async () => {
    const payload = { cityId: 'HGW', data: [] };
    service.getRoutes.mockResolvedValue(payload);
    await expect(controller.getRoutes()).resolves.toEqual(payload);
    expect(service.getRoutes).toHaveBeenCalled();
  });
});
