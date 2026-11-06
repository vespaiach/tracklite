import type { PasswordReset } from "./password-reset";

export type PasswordResetRepository = {
  issue(memberId: string): Promise<string>;
  byToken(token: string): Promise<PasswordReset | undefined>;
  save(reset: PasswordReset): Promise<void>;
};