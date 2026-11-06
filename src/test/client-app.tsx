import type { Issue, Me, MemberSummary, Project } from "../contract";

export const sam: Me = {
  username: "sam",
  fullName: "Sam Lee",
  initials: "SL",
  deactivated: false,
  email: "sam@acme.com",
  role: "member",
};

export const alex: Me = {
  username: "alex",
  fullName: "Alex Kim",
  initials: "AK",
  deactivated: false,
  email: "alex@acme.com",
  role: "member",
};

export const admin: Me = { ...sam, role: "admin" };

export function project(key: string, name: string, archivedAt: string | null = null): Project {
  return {
    key,
    name,
    description: "",
    descriptionVersion: 0,
    mentions: [],
    archivedAt,
    issueCounts: { backlog: 0, in_progress: 0, in_review: 0, done: 0, canceled: 0 },
    createdAt: "2026-09-20T10:42:00.000Z",
    createdBy: null,
  };
}

export function memberOf({ username, fullName, initials, deactivated }: Me): MemberSummary {
  return { username, fullName, initials, deactivated };
}

export function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "WEB-42",
    title: "Fix login button",
    description: "",
    status: "in_progress",
    priority: "high",
    assignees: [memberOf(alex)],
    createdBy: memberOf(sam),
    createdAt: "2026-09-20T10:42:00.000Z",
    updatedAt: "2026-09-20T10:42:00.000Z",
    labels: [],
    descriptionVersion: 0,
    mentions: [],
    archived: false,
    ...overrides,
  };
}