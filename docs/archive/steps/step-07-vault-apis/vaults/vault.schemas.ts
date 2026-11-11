import { z } from "zod";

export const validVaultStatuses = [
  "DRAFT",
  "AWAITING_CLIENT",
  "AWAITING_AUTHORIZATION",
  "AUTHORIZED",
  "IN_PROGRESS",
  "SUBMITTED",
  "VERIFYING",
  "NEEDS_REVISION",
  "AWAITING_APPROVAL",
  "CAPTURE_PENDING",
  "PAID",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
] as const;

export const createVaultSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(255, "Title must not exceed 255 characters"),
    description: z.string().trim().max(2000).optional(),
    amount: z
      .number()
      .positive("Amount must be greater than zero"),
    currency: z.string().trim().length(3).default("USD"),
    expiresAt: z.string().datetime().optional().nullable(),
  }),
});

export const updateVaultSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Vault ID is required"),
  }),
  body: z.object({
    title: z.string().trim().min(3).max(255).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    amount: z.number().positive().optional(),
    status: z.enum(validVaultStatuses).optional(),
  }),
});

export const inviteClientSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Vault ID is required"),
  }),
  body: z.object({
    clientEmail: z
      .string()
      .trim()
      .email("Invalid client email address"),
  }),
});

export const vaultIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1, "Vault ID is required"),
  }),
});
