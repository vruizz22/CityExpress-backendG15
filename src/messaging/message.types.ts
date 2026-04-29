import { PackageBody } from '@dto/package.dto';

export interface BaseMessage {
  idpk: string;
  msgId: string;
  type: string;
  timestamp: string;
  cityId?: string;
}

export interface PackageTransitMessage extends BaseMessage {
  type: 'package-transit';
  packageBody: PackageBody;
}

export interface DistanceTableEntry {
  destinationCode: string;
  destinationName: string;
  distance: number;
  transportCost: number;
  enabled: boolean;
}

export interface DistanceTableMessage extends BaseMessage {
  type: 'distance-table';
  data: {
    distances: Record<string, DistanceTableEntry>;
  };
}

export interface DistanceTableRequestMessage extends BaseMessage {
  type: 'request';
  data: {
    ask: 'distance-table';
  };
}

export type AuditEventType =
  | 'transit'
  | 'transit-redirect'
  | 'expired'
  | 'received'
  | 'delivered';

export interface AuditMessage extends BaseMessage {
  type: AuditEventType;
  pkgId: string;
  data?: {
    nextCityId: string;
  };
}

export interface AckMessage extends BaseMessage {
  type: 'ack' | 'nack';
}
