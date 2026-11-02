-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "account_status_enum" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "agreement_status_enum" AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "approval_status_enum" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "invitation_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ledger_event_type_enum" AS ENUM ('VAULT_CREATED', 'FUNDS_AUTHORIZED', 'MILESTONE_APPROVED', 'PAYMENT_CAPTURED', 'REFUND_ISSUED', 'VAULT_CANCELLED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "milestone_status_enum" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "paypal_transaction_status_enum" AS ENUM ('CREATED', 'PENDING', 'AUTHORIZED', 'COMPLETED', 'CAPTURED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "vault_member_role_enum" AS ENUM ('FREELANCER', 'CLIENT');

-- CreateEnum
CREATE TYPE "vault_status_enum" AS ENUM ('DRAFT', 'AWAITING_CLIENT', 'AWAITING_AUTHORIZATION', 'AUTHORIZED', 'IN_PROGRESS', 'SUBMITTED', 'VERIFYING', 'NEEDS_REVISION', 'AWAITING_APPROVAL', 'CAPTURE_PENDING', 'PAID', 'CANCELLED', 'EXPIRED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "verification_run_type_enum" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "verification_status_enum" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "webhook_processing_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "agreements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "terms" TEXT NOT NULL,
    "status" "agreement_status_enum" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "signed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "milestone_id" UUID,
    "vault_file_id" UUID,
    "requested_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "status" "approval_status_enum" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" "ledger_event_type_enum" NOT NULL,
    "amount" DECIMAL(12,2),
    "currency" VARCHAR(3),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "status" "milestone_status_enum" NOT NULL DEFAULT 'PENDING',
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paypal_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "milestone_id" UUID,
    "paypal_order_id" VARCHAR(255),
    "paypal_capture_id" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "paypal_transaction_status_enum" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paypal_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "avatar_url" TEXT,
    "account_status" "account_status_enum" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" VARCHAR(150) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "sha256_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "vault_member_role_enum" NOT NULL,
    "invitation_status" "invitation_status_enum" NOT NULL DEFAULT 'PENDING',
    "invited_by" UUID,
    "joined_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaults" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "freelancer_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "vault_status_enum" NOT NULL DEFAULT 'DRAFT',
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID NOT NULL,
    "file_id" UUID,
    "run_type" "verification_run_type_enum" NOT NULL DEFAULT 'AUTOMATIC',
    "status" "verification_status_enum" NOT NULL DEFAULT 'QUEUED',
    "result" TEXT,
    "details" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vault_id" UUID,
    "provider" VARCHAR(100) NOT NULL,
    "external_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "payload" JSONB NOT NULL,
    "processing_status" "webhook_processing_status_enum" NOT NULL DEFAULT 'PENDING',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_agreements_vault_created" ON "agreements"("vault_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_agreement_version" ON "agreements"("vault_id", "version");

-- CreateIndex
CREATE INDEX "idx_approvals_file" ON "approvals"("vault_file_id") WHERE (vault_file_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_approvals_milestone" ON "approvals"("milestone_id") WHERE (milestone_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_approvals_vault_status" ON "approvals"("vault_id", "status");

-- CreateIndex
CREATE INDEX "idx_ledger_events_vault_created" ON "ledger_events"("vault_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_milestones_vault_status" ON "milestones"("vault_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_milestone_id_vault" ON "milestones"("id", "vault_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_milestone_sequence" ON "milestones"("vault_id", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_transactions_paypal_order_id_key" ON "paypal_transactions"("paypal_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "paypal_transactions_paypal_capture_id_key" ON "paypal_transactions"("paypal_capture_id");

-- CreateIndex
CREATE INDEX "idx_paypal_transactions_milestone" ON "paypal_transactions"("milestone_id") WHERE (milestone_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_paypal_transactions_status" ON "paypal_transactions"("status");

-- CreateIndex
CREATE INDEX "idx_paypal_transactions_vault" ON "paypal_transactions"("vault_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "vault_files_storage_path_key" ON "vault_files"("storage_path");

-- CreateIndex
CREATE INDEX "idx_vault_files_uploaded_by" ON "vault_files"("uploaded_by");

-- CreateIndex
CREATE INDEX "idx_vault_files_vault_created" ON "vault_files"("vault_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_vault_file_id_vault" ON "vault_files"("id", "vault_id");

-- CreateIndex
CREATE INDEX "idx_vault_members_user_status" ON "vault_members"("user_id", "invitation_status");

-- CreateIndex
CREATE INDEX "idx_vault_members_vault_role" ON "vault_members"("vault_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vault_member" ON "vault_members"("vault_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_vaults_freelancer_id" ON "vaults"("freelancer_id");

-- CreateIndex
CREATE INDEX "idx_vaults_status_created" ON "vaults"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_vault_id_freelancer" ON "vaults"("id", "freelancer_id");

-- CreateIndex
CREATE INDEX "idx_verification_runs_file" ON "verification_runs"("file_id") WHERE (file_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_verification_runs_vault_started" ON "verification_runs"("vault_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "idx_webhook_events_status_received" ON "webhook_events"("processing_status", "received_at");

-- CreateIndex
CREATE INDEX "idx_webhook_events_vault" ON "webhook_events"("vault_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_webhook_provider_event" ON "webhook_events"("provider", "external_event_id");

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "fk_approval_file_same_vault" FOREIGN KEY ("vault_file_id", "vault_id") REFERENCES "vault_files"("id", "vault_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "fk_approval_milestone_same_vault" FOREIGN KEY ("milestone_id", "vault_id") REFERENCES "milestones"("id", "vault_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ledger_events" ADD CONSTRAINT "ledger_events_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paypal_transactions" ADD CONSTRAINT "fk_paypal_milestone_same_vault" FOREIGN KEY ("milestone_id", "vault_id") REFERENCES "milestones"("id", "vault_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paypal_transactions" ADD CONSTRAINT "paypal_transactions_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "fk_verification_file_same_vault" FOREIGN KEY ("file_id", "vault_id") REFERENCES "vault_files"("id", "vault_id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
