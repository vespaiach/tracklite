import "server-only";
import { hash, verify } from "@node-rs/argon2";

const argon2idOwaspBaseline = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

const currentSettingsPrefix = `$argon2id$v=19$m=${argon2idOwaspBaseline.memoryCost},t=${argon2idOwaspBaseline.timeCost},p=${argon2idOwaspBaseline.parallelism}$`;

export function hashPassword(password: string) {
  return hash(password, argon2idOwaspBaseline);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}

export function needsRehash(passwordHash: string) {
  return !passwordHash.startsWith(currentSettingsPrefix);
}