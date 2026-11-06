import type { MemberRepository } from "../../domain/identity/member-repository";
import { DomainError } from "../../domain/shared/domain-error";
import type { UnitOfWork } from "../shared/unit-of-work";
import type { SetupSecret } from "./ports";

export function setupDone() {
  return new DomainError("expired", "Setup already done");
}

export async function checkSetupSecret(
  work: UnitOfWork<{ members: MemberRepository; setupSecret: SetupSecret }>,
  secret: string,
) {
  await work.run(async ({ members, setupSecret }) => {
    if ((await members.count()) > 0) throw setupDone();

    if (!setupSecret.configured()) {
      throw new DomainError(
        "unavailable",
        "Setup isn't enabled. Set SETUP_SECRET on the server and restart.",
      );
    }

    if (!setupSecret.matches(secret)) throw new DomainError("forbidden", "Wrong setup secret");
  });
}