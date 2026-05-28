-- CreateIndex
CREATE INDEX "Appraisal_domain_idx" ON "Appraisal"("domain");

-- CreateIndex
CREATE INDEX "Appraisal_confidence_idx" ON "Appraisal"("confidence");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "DomainListing_status_idx" ON "DomainListing"("status");

-- CreateIndex
CREATE INDEX "DomainListing_tld_idx" ON "DomainListing"("tld");

-- CreateIndex
CREATE INDEX "DomainListing_category_idx" ON "DomainListing"("category");

-- CreateIndex
CREATE INDEX "DomainListing_priceCents_idx" ON "DomainListing"("priceCents");

-- CreateIndex
CREATE INDEX "DomainListing_listingType_idx" ON "DomainListing"("listingType");

-- CreateIndex
CREATE INDEX "DomainListing_status_updatedAt_idx" ON "DomainListing"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_listingId_status_idx" ON "Offer"("listingId", "status");

-- CreateIndex
CREATE INDEX "Offer_buyerId_status_idx" ON "Offer"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Offer_expiresAt_idx" ON "Offer"("expiresAt");

-- CreateIndex
CREATE INDEX "Offer_updatedAt_idx" ON "Offer"("updatedAt");

-- CreateIndex
CREATE INDEX "SearchAlert_active_idx" ON "SearchAlert"("active");

-- CreateIndex
CREATE INDEX "SearchAlert_cadence_idx" ON "SearchAlert"("cadence");

-- CreateIndex
CREATE INDEX "SellerProfile_supportStatus_idx" ON "SellerProfile"("supportStatus");

-- CreateIndex
CREATE INDEX "SupportCase_status_idx" ON "SupportCase"("status");

-- CreateIndex
CREATE INDEX "SupportCase_transactionId_idx" ON "SupportCase"("transactionId");

-- CreateIndex
CREATE INDEX "SupportCase_updatedAt_idx" ON "SupportCase"("updatedAt");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE INDEX "Transaction_escrowId_idx" ON "Transaction"("escrowId");

-- CreateIndex
CREATE INDEX "Transaction_listingId_status_idx" ON "Transaction"("listingId", "status");

-- CreateIndex
CREATE INDEX "Transaction_buyerId_status_idx" ON "Transaction"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Transaction_updatedAt_idx" ON "Transaction"("updatedAt");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_verificationTier_idx" ON "User"("verificationTier");

-- CreateIndex
CREATE INDEX "User_twoFactorEnabled_idx" ON "User"("twoFactorEnabled");
