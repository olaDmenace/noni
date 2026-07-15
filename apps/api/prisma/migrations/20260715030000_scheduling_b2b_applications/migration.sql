-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "sessionType" "SessionType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'BOOKED',
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgAccessCode" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "maxRedemptions" INTEGER NOT NULL DEFAULT 1,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAccessCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "specialties" TEXT[],
    "languages" TEXT[],
    "sessionTypes" "SessionType"[],
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledSession_userId_scheduledAt_idx" ON "ScheduledSession"("userId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledSession_agentId_scheduledAt_idx" ON "ScheduledSession"("agentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledSession_status_scheduledAt_idx" ON "ScheduledSession"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrgAccessCode_code_key" ON "OrgAccessCode"("code");

-- CreateIndex
CREATE INDEX "OrgAccessCode_orgId_idx" ON "OrgAccessCode"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentApplication_userId_key" ON "AgentApplication"("userId");

-- CreateIndex
CREATE INDEX "AgentApplication_status_createdAt_idx" ON "AgentApplication"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgAccessCode" ADD CONSTRAINT "OrgAccessCode_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

