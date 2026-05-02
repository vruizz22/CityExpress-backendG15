export interface PackageBody {
  id: string;
  deliveryStrategy: string;
  maxHops: number;
  createdAt: string;
  deliverNotBefore?: string | null;
  originId: string;
  destinationId: string;
  metaContent?: string | null;
  isMetaEncrypted: boolean;
  constraints?: Record<string, unknown> | null;
  priorityClass: string;
  payment: number;
}

export interface CreatePackageDto {
  idpk: string;
  type: string;
  packageBody: PackageBody;
}

export interface GetPackagesQuery {
  page?: string;
  limit?: string;
  originId?: string;
  destinationId?: string;
  payment?: string;
  deliveryStrategy?: string;
  createdAt?: string;
}

export interface PackageView {
  id: string;
  originId: string;
  destinationId: string;
  maxHops: number;
  createdAt: Date;
  deliverNotBefore: Date | null;
  lastAction: string | null;
  receivedAt: Date;
  canDeliver: boolean;
}

export interface DeliverPackageBody {
  idpk?: string;
}
