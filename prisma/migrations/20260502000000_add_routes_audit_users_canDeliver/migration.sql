-- AlterTable: add receivedAt to PackageEvent (default to now() for existing rows)
ALTER TABLE "PackageEvent"
  ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex on PackageEvent
CREATE INDEX "PackageEvent_packageId_receivedAt_idx" ON "PackageEvent"("packageId", "receivedAt");
CREATE INDEX "PackageEvent_destinationId_idx" ON "PackageEvent"("destinationId");

-- CreateTable Route
CREATE TABLE "Route" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "distance" BIGINT,
    "transportCost" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Route_pkey" PRIMARY KEY ("code")
);

-- CreateTable AuditEvent
CREATE TABLE "AuditEvent" (
    "idpk" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("idpk")
);

CREATE INDEX "AuditEvent_packageId_createdAt_idx" ON "AuditEvent"("packageId", "createdAt");
CREATE INDEX "AuditEvent_type_idx" ON "AuditEvent"("type");

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_subject_key" ON "User"("subject");
