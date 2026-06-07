-- AlterTable User: rol para separación admin/usuario (RNF05)
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- CreateTable UserShipment
CREATE TABLE "UserShipment" (
    "id" TEXT NOT NULL,
    "ownerSubject" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL,
    "maxHops" INTEGER NOT NULL,
    "deliveryStrategy" TEXT NOT NULL DEFAULT 'random',
    "priorityClass" TEXT NOT NULL DEFAULT 'medium',
    "deliverNotBefore" TIMESTAMP(3),
    "metaContent" TEXT,
    "routeMetricCost" BIGINT NOT NULL,
    "fPrice" DOUBLE PRECISION NOT NULL,
    "amount" INTEGER NOT NULL,
    "hops" INTEGER NOT NULL,
    "nextHop" TEXT,
    "routePath" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending-payment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserShipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserShipment_packageId_key" ON "UserShipment"("packageId");
CREATE INDEX "UserShipment_ownerSubject_createdAt_idx" ON "UserShipment"("ownerSubject", "createdAt");

-- CreateTable Payment
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "ownerSubject" TEXT NOT NULL,
    "buyOrder" TEXT NOT NULL,
    "webpayToken" TEXT,
    "sessionId" TEXT NOT NULL,
    "redirectUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CLP',
    "status" TEXT NOT NULL DEFAULT 'TRYING',
    "authorizationCode" TEXT,
    "reason" TEXT,
    "transactionDate" TIMESTAMP(3),
    "responseRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_buyOrder_key" ON "Payment"("buyOrder");
CREATE UNIQUE INDEX "Payment_webpayToken_key" ON "Payment"("webpayToken");
CREATE INDEX "Payment_shipmentId_idx" ON "Payment"("shipmentId");
CREATE INDEX "Payment_ownerSubject_idx" ON "Payment"("ownerSubject");

-- CreateTable Job
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReceivedTable
CREATE TABLE "ReceivedTable" (
    "sourceCityId" TEXT NOT NULL,
    "distances" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivedTable_pkey" PRIMARY KEY ("sourceCityId")
);

-- CreateTable CalculatedRoute
CREATE TABLE "CalculatedRoute" (
    "id" TEXT NOT NULL,
    "destinationCode" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "nextHop" TEXT,
    "routeMetricCost" BIGINT,
    "hops" INTEGER,
    "path" JSONB NOT NULL,
    "reachable" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculatedRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalculatedRoute_destinationCode_criteria_key" ON "CalculatedRoute"("destinationCode", "criteria");
