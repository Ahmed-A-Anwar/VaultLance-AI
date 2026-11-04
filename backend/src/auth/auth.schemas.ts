import { z } from "zod";

export const registerSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, "Email is required")
      .trim()
      .email("Invalid email format")
      .toLowerCase(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password is too long"),
    fullName: z
      .string()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must not exceed 100 characters")
      .trim(),
    role: z
      .enum(["FREELANCER", "CLIENT"])
      .default("FREELANCER"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .min(1, "Email is required")
      .trim()
      .email("Invalid email format")
      .toLowerCase(),
    password: z
      .string()
      .min(1, "Password is required"),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name must not exceed 100 characters"),
  }),
});

export const deleteAccountSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email format"),
  }),
});

export const passwordResetRequestSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email("Invalid email format"),
  }),
});

export const passwordResetConfirmSchema = z.object({
  body: z.object({
    token: z.string().trim().min(16, "Invalid reset token").optional(),
    accessToken: z.string().trim().min(16, "Invalid access token").optional(),
    password: z.string().min(8, "Password must be at least 8 characters long"),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters long")
      .max(128, "Password is too long"),
  }),
});
