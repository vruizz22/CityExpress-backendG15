import { Logger } from '@nestjs/common';
import { PackageBody } from '@dto/package.dto';

// RF04
export const INITIAL_SHIPMENT_SERVICE = 'INITIAL_SHIPMENT_SERVICE';

export interface InitialShipmentService {
  send(packageBody: PackageBody): Promise<void>;
}

export class StubInitialShipmentService implements InitialShipmentService {
  private readonly logger = new Logger('InitialShipmentService');

  async send(packageBody: PackageBody): Promise<void> {
    this.logger.log(
      `[STUB] enviado al siguiente salto: paquete ${packageBody.id} -> ${packageBody.destinationId}`,
    );
    return Promise.resolve();
  }
}
