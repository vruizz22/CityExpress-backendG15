import { Injectable } from '@nestjs/common';
import { PackageBody } from '@dto/package.dto';

export abstract class PackageDeliveryService {
  abstract deliver(packageBody: PackageBody): Promise<void>;
}

@Injectable()
export class NoopPackageDeliveryService implements PackageDeliveryService {
  async deliver(packageBody: PackageBody): Promise<void> {
    void packageBody;
    return Promise.resolve();
  }
}
