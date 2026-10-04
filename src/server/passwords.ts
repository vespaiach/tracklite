import "server-only";
import { hash, verify } from "@node-rs/argon2";

const minLength = 12;
const maxLength = 128;
const argon2idOwaspBaseline = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function passwordError(password: string) {
  const length = [...password].length;
  if (length < minLength) return `At least ${minLength} characters`;
  if (length > maxLength) return `Too long (max ${maxLength})`;
  return undefined;
}

export function hashPassword(password: string) {
  return hash(password, argon2idOwaspBaseline);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}