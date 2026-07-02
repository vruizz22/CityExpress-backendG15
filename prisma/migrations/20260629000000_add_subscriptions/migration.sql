-- RF01

-- CreateTable Subscription
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "ownerSubject" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "criteria" TEXT NOT NULL DEFAULT 'distance',
    "maxHops" INTEGER NOT NULL,
    "deliveryStrategy" TEXT NOT NULL DEFAULT 'random',
    "priorityClass" TEXT NOT NULL DEFAULT 'medium',
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "metaContent" TEXT,
    "periodSeconds" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "budget" INTEGER NOT NULL,
    "pricePerShipment" INTEGER NOT NULL,
    "budgetSpent" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sfnExecutionArn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Subscription_ownerSubject_createdAt_idx" ON "Subscription"("ownerSubject", "createdAt");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateTable SubscriptionShipment
CREATE TABLE "SubscriptionShipment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "tickNumber" INTEGER NOT NULL,
    "packageId" TEXT,
    "userShipmentId" TEXT,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'triggered',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionShipment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionShipment_idempotencyKey_key" ON "SubscriptionShipment"("idempotencyKey");
CREATE INDEX "SubscriptionShipment_subscriptionId_tickNumber_idx" ON "SubscriptionShipment"("subscriptionId", "tickNumber");

-- CreateTable BudgetLedgerEntry
CREATE TABLE "BudgetLedgerEntry" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetLedgerEntry_subscriptionId_createdAt_idx" ON "BudgetLedgerEntry"("subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionShipment" ADD CONSTRAINT "SubscriptionShipment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetLedgerEntry" ADD CONSTRAINT "BudgetLedgerEntry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
