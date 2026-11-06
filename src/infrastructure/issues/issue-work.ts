import "server-only";
import { drizzleMemberDirectory } from "../identity/drizzle-member-directory";
import { drizzleProjectRepository } from "../projects/drizzle-project-repository";
import { unitOfWork } from "../unit-of-work";
import { drizzleIssueRepository } from "./drizzle-issue-repository";

export const issueWork = unitOfWork((scope) => ({
  issues: drizzleIssueRepository(scope),
  projects: drizzleProjectRepository(scope),
  members: drizzleMemberDirectory(scope),
}));