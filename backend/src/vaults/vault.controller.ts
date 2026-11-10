import type { Request, Response, NextFunction } from "express";
import { vaultDomainService } from "./vault.domain-service.js";
import { sendSuccess, sendCreated } from "../shared/response.js";
import { UnauthorizedError } from "../shared/errors.js";

export class VaultController {
  public async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const { title, description, amount, currency, expiresAt } = req.body;

      const vault = await vaultDomainService.createVault({
        freelancerId: req.user.id,
        title,
        description,
        amount,
        currency,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      });

      return sendCreated(res, vault, "Vault created successfully");
    } catch (err) {
      next(err);
    }
  }

  public async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const prefetched = res.locals.vaultsPromise as Promise<any> | undefined;
      const started = res.locals.vaultListStartedAt as number | undefined;
      const meta = res.locals.vaultListMeta as { source?: string } | undefined;
      const vaults = await (prefetched ?? vaultDomainService.getVaultsForUser(req.user.id));
      if (typeof started === "number") {
        const source = meta?.source ?? "unknown";
        res.setHeader(
          "Server-Timing",
          `vault-list;desc="${source}";dur=${Math.round(performance.now() - started)}`
        );
      }
      return sendSuccess(res, vaults, "Vaults retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = String(req.params.id);
      const vault = await vaultDomainService.getVaultById(req.user.id, id);
      return sendSuccess(res, vault, "Vault retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = String(req.params.id);
      const { title, description, amount, status } = req.body;

      const vault = await vaultDomainService.updateVault({
        userId: req.user.id,
        vaultId: id,
        title,
        description,
        amount,
        status,
      });

      return sendSuccess(res, vault, "Vault updated successfully");
    } catch (err) {
      next(err);
    }
  }

  public async invite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = String(req.params.id);
      const { clientEmail } = req.body;

      const vault = await vaultDomainService.inviteClient({
        freelancerId: req.user.id,
        vaultId: id,
        clientEmail,
      });

      return sendSuccess(res, vault, "Invitation sent successfully");
    } catch (err) {
      next(err);
    }
  }

  public async accept(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const id = String(req.params.id);

      const vault = await vaultDomainService.acceptInvite({
        clientId: req.user.id,
        vaultId: id,
      });

      return sendSuccess(res, vault, "Invitation accepted successfully");
    } catch (err) {
      next(err);
    }
  }
}

export const vaultController = new VaultController();
