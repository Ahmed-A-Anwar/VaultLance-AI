/* auth.ts — the signup contract: sanitise, then validate. The same schema the
   form renders errors from is the one a future API route should run, so the
   rules live here and not in the page.

   Every string is normalised before it is checked: leading/trailing whitespace
   is trimmed, the invisible characters a paste can smuggle into a field are
   stripped, and both emails are lowercased. Passwords are the exception — they
   are never trimmed, because a password that quietly loses a character is a
   password the user cannot type again; whitespace in one is rejected instead. */

import { z } from "zod";

export const ROLES = ["freelancer", "client"] as const;
export type Role = (typeof ROLES)[number];

const EMAIL_MAX = 254; // RFC 5321
const NAME_MIN = 2;
const NAME_MAX = 70;

/* letters in any script, combining marks, apostrophes, hyphens and spaces —
   no angle brackets, so a tag or a script payload cannot pass */
const NAME_RE = /^[\p{L}\p{M}'\-\s]+$/u;

/* soft hyphen, zero-width space/non-joiner/joiner, word joiner, BOM */
const INVISIBLE_RE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;

const SPECIAL_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/;

/** Trim, then drop invisible characters. Also run on the raw input before validation. */
export function sanitizeText(value: string): string {
  return value.replace(INVISIBLE_RE, "").trim();
}

/** The domain problems a plain email check lets through. */
function domainIssue(value: string): string | null {
  const at = value.lastIndexOf("@");
  const domain = value.slice(at + 1);
  if (domain.includes("..")) return "Email domains can't contain two dots in a row.";
  if (domain.split(".").some((part) => part.startsWith("-") || part.endsWith("-")))
    return "Email domains can't begin or end a segment with a hyphen.";
  return null;
}

/** The message for an email that isn't one, or null when it passes. The
 *  domain is checked first so a doubled dot or a dangling hyphen says what is
 *  actually wrong instead of falling through to the generic message. */
function emailIssue(value: string): string | null {
  if (value.length > EMAIL_MAX)
    return `Email addresses can't be longer than ${EMAIL_MAX} characters.`;
  if (value.lastIndexOf("@") > 0) {
    const issue = domainIssue(value);
    if (issue) return issue;
  }
  if (!z.string().email().safeParse(value).success) return "Enter a valid email address.";
  return null;
}

/** Trimmed and lowercased before the shape is checked. */
const asEmail = z
  .string()
  .transform((value) => sanitizeText(value).toLowerCase())
  .pipe(z.string());

const emailField = asEmail.pipe(
  z.string().superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue({ code: "custom", message: "Enter your email address." });
      return;
    }
    const issue = emailIssue(value);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
  })
);

const fullNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(NAME_MIN, "Enter the name on your account.")
      .max(NAME_MAX, `Names can't be longer than ${NAME_MAX} characters.`)
      .regex(NAME_RE, "Full name can only contain letters, spaces, hyphens, and apostrophes.")
  );

const passwordField = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Passwords can't be longer than 128 characters.")
  .regex(/[A-Z]/, "Add at least one uppercase letter.")
  .regex(/[a-z]/, "Add at least one lowercase letter.")
  .regex(/[0-9]/, "Add at least one number.")
  .regex(SPECIAL_RE, "Add at least one symbol.")
  .refine((value) => !/\s/.test(value), "Passwords can't contain spaces.")
  .refine((value) => !value.includes("\u0000"), "Passwords can't contain null bytes.");

export const signupSchema = z
  .object({
    fullName: fullNameField,
    email: emailField,
    password: passwordField,
    role: z.enum(ROLES),
    /* only normalised here: whether it is required, or even looked at, depends
       on the role, which is checked once the whole object is known */
    paypalEmail: asEmail,
  })
  .superRefine((values, ctx) => {
    /* a client pays from their card, so a PayPal address is meaningless for
       them: whatever is left in the field is ignored and never sent. A
       freelancer cannot be paid without one, so an empty one is an error. */
    if (values.role !== "freelancer") return;
    if (values.paypalEmail === "") {
      ctx.addIssue({
        code: "custom",
        path: ["paypalEmail"],
        message: "Freelancers need a PayPal email for payouts.",
      });
      return;
    }
    const issue = emailIssue(values.paypalEmail);
    if (issue) ctx.addIssue({ code: "custom", path: ["paypalEmail"], message: issue });
  });

/** What the form holds while typing, before the transforms run. */
export type SignupInput = z.input<typeof signupSchema>;
/** The sanitised, validated values. */
export type SignupValues = z.output<typeof signupSchema>;

export interface SignupPayload {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  paypalEmail?: string;
}

/** The clean body for the API: a client's paypalEmail is dropped, not sent empty. */
export function toSignupPayload(values: SignupValues): SignupPayload {
  const { fullName, email, password, role, paypalEmail } = values;
  return role === "freelancer"
    ? { fullName, email, password, role, paypalEmail }
    : { fullName, email, password, role };
}
