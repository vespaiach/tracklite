import "server-only";
import { drizzleMemberDirectory } from "../identity/drizzle-member-directory";
import { drizzleIssueRepository } from "../issues/drizzle-issue-repository";
import { drizzleProjectRepository } from "../projects/drizzle-project-repository";
import { unitOfWork } from "../unit-of-work";
import { drizzleCommentRepository } from "./drizzle-comment-repository";

export const commentWork = unitOfWork((scope) => ({
  comments: drizzleCommentRepository(scope),
  issues: drizzleIssueRepository(scope),
  projects: drizzleProjectRepository(scope),
  members: drizzleMemberDirectory(scope),
}));