import "server-only";
import { drizzleMemberDirectory } from "../identity/drizzle-member-directory";
import { unitOfWork } from "../unit-of-work";
import { drizzleProjectRepository } from "./drizzle-project-repository";

export const projectWork = unitOfWork((scope) => ({
  projects: drizzleProjectRepository(scope),
  members: drizzleMemberDirectory(scope),
}));