import "server-only";
import { timingSafeEqual } from "node:crypto";
import { DomainError } from "../../../domain/shared/domain-error";
import { readConfig } from "../../../infrastructure/config";
import { hashToken } from "../../../infrastructure/tokens";
import { setupDone } from "../setup";
import { setupNeeded } from "./setup-needed";

export async function checkSetupSecret(secret: string) {
  if (!(await setupNeeded())) throw setupDone();

  const configured = readConfig().setupSecret;
  if (!configured) {
    throw new DomainError("unavailable", "Setup isn't enabled. Set SETUP_SECRET on the server and restart.");
  }

  if (!timingSafeEqual(hashToken(secret), hashToken(configured))) {
    throw new DomainError("forbidden", "Wrong setup secret");
  }
}