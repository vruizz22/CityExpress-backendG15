import { Prisma } from '@prisma/client';
import { PackageBody } from '@dto/package.dto';

interface PackageEventInput {
  idpk: string;
  type: string;
  packageBody: PackageBody;
  senderCityId?: string | null;
}

export const buildPackageEventData = ({
  idpk,
  type,
  packageBody,
  senderCityId,
}: PackageEventInput): Prisma.PackageEventCreateInput => {
  return {
    idpk,
    type,
    packageId: packageBody.id,
    deliveryStrategy: packageBody.deliveryStrategy,
    maxHops: packageBody.maxHops,
    createdAt: new Date(packageBody.createdAt),
    deliverNotBefore: packageBody.deliverNotBefore
      ? new Date(packageBody.deliverNotBefore)
      : null,
    originId: packageBody.originId,
    destinationId: packageBody.destinationId,
    metaContent: packageBody.metaContent ?? null,
    isMetaEncrypted: packageBody.isMetaEncrypted,
    constraints: (packageBody.constraints ?? {}) as Prisma.InputJsonValue,
    priorityClass: packageBody.priorityClass,
    payment: Number(packageBody.payment),
    senderCityId: senderCityId ?? null,
  };
};
