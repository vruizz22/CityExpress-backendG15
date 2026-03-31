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
