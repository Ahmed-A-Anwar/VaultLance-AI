import { logger } from "./logger.js";
import { DatabaseError } from "./errors.js";

export interface DbUserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: "FREELANCER" | "CLIENT";
  avatar_url?: string | null;
  /** where payouts are sent; empty falls back to the login email */
  paypal_payout_email?: string | null;
  account_status: "ACTIVE" | "PENDING" | "SUSPENDED";
  created_at: Date;
  updated_at: Date;
}

export interface DbVaultRecord {
  id: string;
  freelancer_id: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: string;
  expires_at?: Date | null;
  created_at: Date;
  updated_at: Date;
  /* the last failed audit, the waivers taken at approval, and the revision note */
  failed_checks?: Array<{ id: string; name: string; detail?: string }>;
  waived_checks?: Array<{ checkId: string; name: string; reason?: string; waivedAt?: string; waivedBy?: string }>;
  revision_note?: string | null;
}

export interface DbVaultMemberRecord {
  id: string;
  vault_id: string;
  user_id: string;
  role: "FREELANCER" | "CLIENT";
  invitation_status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  invited_by?: string | null;
  joined_at?: Date | null;
  created_at: Date;
}

export interface DbVaultFileRecord {
  id: string;
  vault_id: string;
  uploaded_by: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string;
  created_at: Date;
}

export interface DbSessionRecord {
  id: string;
  user_id: string;
  token: string;
  created_at: Date;
  expires_at: Date;
  revoked: boolean;
  ip_address?: string;
  user_agent?: string;
}

export interface DbAuditMessageRecord {
  id: string;
  vault_id: string;
  user_id: string | null;
  role: "ai" | "user";
  text: string;
  sources: string[];
  cached: boolean;
  created_at: Date;
}

class InMemoryDbStore {
  public users: Map<string, DbUserRecord> = new Map();
  public vaults: Map<string, DbVaultRecord> = new Map();
  public members: Map<string, DbVaultMemberRecord> = new Map();
  public files: Map<string, DbVaultFileRecord> = new Map();
  public sessions: Map<string, DbSessionRecord> = new Map();
  public auditMessages: Map<string, DbAuditMessageRecord> = new Map();
  public failNextOperation: boolean = false;
  public simulateFailure: boolean = false;

  public clear() {
    this.users.clear();
    this.vaults.clear();
    this.members.clear();
    this.files.clear();
    this.sessions.clear();
    this.auditMessages.clear();
    this.failNextOperation = false;
    this.simulateFailure = false;
  }

  public checkFailure() {
    if (this.failNextOperation || this.simulateFailure) {
      if (this.failNextOperation) this.failNextOperation = false;
      throw new DatabaseError("Simulated database failure: connection refused or query failed");
    }
  }
}

export const inMemoryStore = new InMemoryDbStore();

export const database = {
  store: inMemoryStore,

  setSimulateFailure(fail: boolean) {
    inMemoryStore.simulateFailure = fail;
  },

  setFailNext(fail: boolean) {
    inMemoryStore.failNextOperation = fail;
  },

  isHealthy(): boolean {
    return !inMemoryStore.simulateFailure;
  },

  reset() {
    inMemoryStore.clear();
  },
};
