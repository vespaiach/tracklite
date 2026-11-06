import { usableReset } from "../../domain/identity/password-reset";
import type { PasswordResetRepository } from "../../domain/identity/password-reset-repository";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function checkResetLink(
  work: UnitOfWork<{ passwordResets: PasswordResetRepository }>,
  token: string,
) {
  await work.run(async ({ passwordResets }) => {
    usableReset(await passwordResets.byToken(token));
  });
}