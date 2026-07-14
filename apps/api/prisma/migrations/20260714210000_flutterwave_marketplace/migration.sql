-- DropIndex
DROP INDEX "AgentPayout_paystackRef_key";

-- DropIndex
DROP INDEX "Subscription_paystackSubCode_key";

-- DropIndex
DROP INDEX "WalletTransaction_paystackRef_key";

-- AlterTable
ALTER TABLE "Agent" DROP COLUMN "paystackRecipientCode",
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "flaggedForReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AgentPayout" DROP COLUMN "paystackRef",
ADD COLUMN     "providerRef" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "paidFromSubscription" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "paystackSubCode",
ADD COLUMN     "graceUntil" TIMESTAMP(3),
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "rolloverSessions" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WalletTransaction" DROP COLUMN "paystackRef",
ADD COLUMN     "providerRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AgentPayout_providerRef_key" ON "AgentPayout"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerRef_key" ON "Subscription"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_providerRef_key" ON "WalletTransaction"("providerRef");

