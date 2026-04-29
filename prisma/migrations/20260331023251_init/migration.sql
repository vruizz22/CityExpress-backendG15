-- CreateTable
CREATE TABLE "PackageEvent" (
    "idpk" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "deliveryStrategy" TEXT NOT NULL,
    "maxHops" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "deliverNotBefore" TIMESTAMP(3),
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "metaContent" TEXT,
    "isMetaEncrypted" BOOLEAN NOT NULL,
    "constraints" JSONB,
    "priorityClass" TEXT NOT NULL,
    "payment" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PackageEvent_pkey" PRIMARY KEY ("idpk")
);
