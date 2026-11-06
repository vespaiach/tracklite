import type { SessionRepository } from "../../domain/identity/session-repository";
import type { UnitOfWork } from "../shared/unit-of-work";

export async function signOut(work: UnitOfWork<{ sessions: SessionRepository }>, token: string) {
  await work.run(({ sessions }) => sessions.end(token));
}