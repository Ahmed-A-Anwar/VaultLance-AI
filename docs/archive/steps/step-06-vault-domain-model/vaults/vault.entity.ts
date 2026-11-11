import type { VaultStatus } from "../shared/types.js";
import { BadRequestError } from "../shared/errors.js";

export class VaultEntity {
  public readonly id: string;
  public readonly freelancerId: string;
  public title: string;
  public description: string | null;
  public amount: number;
  public currency: string;
  public status: VaultStatus;
  public expiresAt: Date | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(params: {
    id: string;
    freelancerId: string;
    title: string;
    description?: string | null;
    amount: number;
    currency?: string;
    status?: VaultStatus;
    expiresAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.validateTitle(params.title);
    this.validateAmount(params.amount);

    this.id = params.id;
    this.freelancerId = params.freelancerId;
    this.title = params.title.trim();
    this.description = params.description ?? null;
    this.amount = Number(params.amount);
    this.currency = (params.currency || "USD").toUpperCase();
    this.status = params.status || "DRAFT";
    this.expiresAt = params.expiresAt ?? null;
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  public validateTitle(title: string): void {
    if (!title || title.trim().length < 3) {
      throw new BadRequestError("Vault title must be at least 3 characters long.", "INVALID_VAULT_TITLE");
    }
    if (title.length > 255) {
      throw new BadRequestError("Vault title must not exceed 255 characters.", "INVALID_VAULT_TITLE");
    }
  }

  public validateAmount(amount: number): void {
    if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      throw new BadRequestError("Vault amount must be a positive number greater than zero.", "INVALID_VAULT_AMOUNT");
    }
  }

  public updateDetails(title?: string, description?: string | null, amount?: number): void {
    if (title !== undefined) {
      this.validateTitle(title);
      this.title = title.trim();
    }
    if (description !== undefined) {
      this.description = description ? description.trim() : null;
    }
    if (amount !== undefined) {
      this.validateAmount(amount);
      this.amount = Number(amount);
    }
    this.updatedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      freelancerId: this.freelancerId,
      title: this.title,
      description: this.description,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
