import { Test, TestingModule } from '@nestjs/testing';
import { PackagesController } from '@packages/packages.controller';
import { PackagesService } from '@packages/packages.service';

describe('PackagesController', () => {
  let controller: PackagesController;
  let service: {
    createPackage: jest.Mock;
    getPackages: jest.Mock;
    getPackageById: jest.Mock;
    deliverPackage: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createPackage: jest.fn(),
      getPackages: jest.fn(),
      getPackageById: jest.fn(),
      deliverPackage: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PackagesController],
      providers: [{ provide: PackagesService, useValue: service }],
    }).compile();
    controller = module.get<PackagesController>(PackagesController);
  });

  it('forwards body.idpk to deliverPackage', async () => {
    service.deliverPackage.mockResolvedValue({ delivered: true });
    await controller.deliverPackage('pkg-1', { idpk: 'caller-key' });
    expect(service.deliverPackage).toHaveBeenCalledWith('pkg-1', 'caller-key');
  });

  it('uses Idempotency-Key header when body.idpk is missing', async () => {
    service.deliverPackage.mockResolvedValue({ delivered: true });
    await controller.deliverPackage('pkg-1', {}, 'header-key');
    expect(service.deliverPackage).toHaveBeenCalledWith('pkg-1', 'header-key');
  });

  it('passes undefined idpk when neither body nor header is present', async () => {
    service.deliverPackage.mockResolvedValue({ delivered: true });
    await controller.deliverPackage('pkg-1');
    expect(service.deliverPackage).toHaveBeenCalledWith('pkg-1', undefined);
  });
});
