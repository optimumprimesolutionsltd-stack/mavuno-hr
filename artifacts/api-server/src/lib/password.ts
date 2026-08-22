import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { randomBytes } from "crypto";

const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => argonHash(pw, OPTS);

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try { return await argonVerify(stored, pw); } catch { return false; }
}

export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

const WEAK = new Set(["password","welcome@2026","12345678","qwerty123","admin123","letmein1"]);
export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 7) return "Password must be at least 7 characters";
  if (WEAK.has(pw.toLowerCase())) return "This password is too common";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw))
    return "Password must contain upper case, lower case and a digit";
  return null;
}
