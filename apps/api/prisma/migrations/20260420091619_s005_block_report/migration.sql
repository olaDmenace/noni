-- CreateTable
CREATE TABLE "AgentBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentBlock_agentId_idx" ON "AgentBlock"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentBlock_userId_agentId_key" ON "AgentBlock"("userId", "agentId");

-- CreateIndex
CREATE INDEX "AgentReport_agentId_idx" ON "AgentReport"("agentId");

-- CreateIndex
CREATE INDEX "AgentReport_reviewedAt_idx" ON "AgentReport"("reviewedAt");

-- AddForeignKey
ALTER TABLE "AgentBlock" ADD CONSTRAINT "AgentBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBlock" ADD CONSTRAINT "AgentBlock_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentBlock" ADD CONSTRAINT "AgentBlock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReport" ADD CONSTRAINT "AgentReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReport" ADD CONSTRAINT "AgentReport_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentReport" ADD CONSTRAINT "AgentReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
