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
  type: 'distance-table' | 'cost-update';
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

export type PaymentStatus = 'TRYING' | 'SUCCESS' | 'FAILED';

export interface PaymentStatusData {
  status: PaymentStatus;
  paymentId: string;
  amount: number;
  currency: string;
  destinationId: string;
  criteria: string;
  routeMetricCost: number;
  maxHops: number;
  authorizationCode?: string;
  transactionDate?: string;
  reason?: string;
}

// RF03
export interface PaymentStatusMessage extends BaseMessage {
  type: 'payment-status';
  pkgId: string;
  payment_token: string;
  data: PaymentStatusData;
}
