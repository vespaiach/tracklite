import "server-only";
import { hash, verify } from "@node-rs/argon2";

const argon2idOwaspBaseline = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string) {
  return hash(password, argon2idOwaspBaseline);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}