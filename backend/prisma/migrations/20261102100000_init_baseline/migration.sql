-- ============================================================
-- VAULTPAY - FINAL INITIAL DATABASE SCHEMA
-- PostgreSQL / Supabase | 11 application tables
-- Target: a NEW, EMPTY application schema/database.
-- Review before execution. This is not a migration for the
-- existing VaultPay database and contains no DROP statements.
-- ============================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ENUM TYPES
CREATE TYPE account_status_enum AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED');
CREATE TYPE vault_status_enum AS ENUM (
  'DRAFT', 'AWAITING_CLIENT', 'AWAITING_AUTHORIZATION', 'AUTHORIZED',
  'IN_PROGRESS', 'SUBMITTED', 'VERIFYING', 'NEEDS_REVISION',
  'AWAITING_APPROVAL', 'CAPTURE_PENDING', 'PAID', 'CANCELLED',
  'EXPIRED', 'DISPUTED'
);
CREATE TYPE vault_member_role_enum AS ENUM ('FREELANCER', 'CLIENT');
CREATE TYPE invitation_status_enum AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');
CREATE TYPE agreement_status_enum AS ENUM ('DRAFT', 'PENDING_SIGNATURE', 'SIGNED', 'REJECTED', 'SUPERSEDED');
CREATE TYPE milestone_status_enum AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED');
CREATE TYPE approval_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
CREATE TYPE ledger_event_type_enum AS ENUM (
  'VAULT_CREATED', 'FUNDS_AUTHORIZED', 'MILESTONE_APPROVED',
  'PAYMENT_CAPTURED', 'REFUND_ISSUED', 'VAULT_CANCELLED', 'ADJUSTMENT'
);
CREATE TYPE paypal_transaction_status_enum AS ENUM (
  'CREATED', 'PENDING', 'AUTHORIZED', 'COMPLETED', 'CAPTURED',
  'FAILED', 'REFUNDED', 'CANCELLED'
);
CREATE TYPE verification_run_type_enum AS ENUM ('AUTOMATIC', 'MANUAL');
CREATE TYPE verification_status_enum AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'NEEDS_REVIEW');
CREATE TYPE webhook_processing_status_enum AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- 2. USERS
-- Supabase Auth owns authentication credentials. This table stores profile data.
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  account_status account_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. VAULTS
CREATE TABLE vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  freelancer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  status vault_status_enum NOT NULL DEFAULT 'DRAFT',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vault_id_freelancer UNIQUE (id, freelancer_id)
);

-- 4. VAULT MEMBERS
-- Join table for users participating in a vault (freelancer/client).
CREATE TABLE vault_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role vault_member_role_enum NOT NULL,
  invitation_status invitation_status_enum NOT NULL DEFAULT 'PENDING',
  invited_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vault_member UNIQUE (vault_id, user_id)
);

-- 5. AGREEMENTS
CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  terms TEXT NOT NULL,
  status agreement_status_enum NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_agreement_version UNIQUE (vault_id, version)
);

-- 6. MILESTONES
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  status milestone_status_enum NOT NULL DEFAULT 'PENDING',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_milestone_sequence UNIQUE (vault_id, sequence_number),
  CONSTRAINT uq_milestone_id_vault UNIQUE (id, vault_id)
);

-- 7. VAULT FILES
-- File bytes live in a private Supabase Storage bucket; this table stores metadata.
CREATE TABLE vault_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  file_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(150) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  sha256_hash CHAR(64) NOT NULL CHECK (sha256_hash ~ '^[A-Fa-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vault_file_id_vault UNIQUE (id, vault_id)
);

-- 8. APPROVALS
-- Each approval targets exactly one milestone OR one file.
-- Multiple approval records are allowed to preserve review history.
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  milestone_id UUID,
  vault_file_id UUID,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  status approval_status_enum NOT NULL DEFAULT 'PENDING',
  comments TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_approval_exactly_one_target CHECK (
    (milestone_id IS NOT NULL AND vault_file_id IS NULL) OR
    (milestone_id IS NULL AND vault_file_id IS NOT NULL)
  ),
  CONSTRAINT fk_approval_milestone_same_vault
    FOREIGN KEY (milestone_id, vault_id) REFERENCES milestones(id, vault_id) ON DELETE RESTRICT,
  CONSTRAINT fk_approval_file_same_vault
    FOREIGN KEY (vault_file_id, vault_id) REFERENCES vault_files(id, vault_id) ON DELETE RESTRICT,
  CONSTRAINT chk_approval_review_fields CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
    (status <> 'PENDING' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

-- 9. LEDGER EVENTS
-- Append-only financial/audit history. Do not update/delete events in application code.
CREATE TABLE ledger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type ledger_event_type_enum NOT NULL,
  amount NUMERIC(12,2),
  currency VARCHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ledger_amount_currency CHECK (
    (amount IS NULL AND currency IS NULL) OR
    (amount IS NOT NULL AND currency IS NOT NULL)
  )
);

-- 10. PAYPAL TRANSACTIONS
-- M1 creates the data model only; payment execution belongs to the payment phase.
-- milestone_id is optional: NULL means vault-level transaction; otherwise milestone-level.
CREATE TABLE paypal_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  milestone_id UUID,
  paypal_order_id VARCHAR(255) UNIQUE,
  paypal_capture_id VARCHAR(255) UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status paypal_transaction_status_enum NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_paypal_milestone_same_vault
    FOREIGN KEY (milestone_id, vault_id) REFERENCES milestones(id, vault_id) ON DELETE RESTRICT
);

-- 11. VERIFICATION RUNS
CREATE TABLE verification_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE RESTRICT,
  file_id UUID,
  run_type verification_run_type_enum NOT NULL DEFAULT 'AUTOMATIC',
  status verification_status_enum NOT NULL DEFAULT 'QUEUED',
  result TEXT,
  details JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT fk_verification_file_same_vault
    FOREIGN KEY (file_id, vault_id) REFERENCES vault_files(id, vault_id) ON DELETE RESTRICT
);

-- 12. WEBHOOK EVENTS
-- Provider + external_event_id uniquely identifies a webhook delivery.
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vault_id UUID REFERENCES vaults(id) ON DELETE SET NULL,
  provider VARCHAR(100) NOT NULL,
  external_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(150) NOT NULL,
  payload JSONB NOT NULL,
  processing_status webhook_processing_status_enum NOT NULL DEFAULT 'PENDING',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT uq_webhook_provider_event UNIQUE (provider, external_event_id)
);

-- 13. INDEXES
CREATE INDEX idx_vaults_freelancer_id ON vaults(freelancer_id);
CREATE INDEX idx_vaults_status_created ON vaults(status, created_at DESC);
CREATE INDEX idx_vault_members_user_status ON vault_members(user_id, invitation_status);
CREATE INDEX idx_vault_members_vault_role ON vault_members(vault_id, role);
CREATE INDEX idx_agreements_vault_created ON agreements(vault_id, created_at DESC);
CREATE INDEX idx_milestones_vault_status ON milestones(vault_id, status);
CREATE INDEX idx_vault_files_vault_created ON vault_files(vault_id, created_at DESC);
CREATE INDEX idx_vault_files_uploaded_by ON vault_files(uploaded_by);
CREATE INDEX idx_approvals_vault_status ON approvals(vault_id, status);
CREATE INDEX idx_approvals_milestone ON approvals(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX idx_approvals_file ON approvals(vault_file_id) WHERE vault_file_id IS NOT NULL;
CREATE INDEX idx_ledger_events_vault_created ON ledger_events(vault_id, created_at DESC);
CREATE INDEX idx_paypal_transactions_vault ON paypal_transactions(vault_id);
CREATE INDEX idx_paypal_transactions_milestone ON paypal_transactions(milestone_id) WHERE milestone_id IS NOT NULL;
CREATE INDEX idx_paypal_transactions_status ON paypal_transactions(status);
CREATE INDEX idx_verification_runs_vault_started ON verification_runs(vault_id, started_at DESC);
CREATE INDEX idx_verification_runs_file ON verification_runs(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX idx_webhook_events_vault ON webhook_events(vault_id);
CREATE INDEX idx_webhook_events_status_received ON webhook_events(processing_status, received_at);

-- 14. updated_at TRIGGER
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vaults_updated_at
BEFORE UPDATE ON vaults FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_milestones_updated_at
BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_paypal_transactions_updated_at
BEFORE UPDATE ON paypal_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- END
-- ============================================================
