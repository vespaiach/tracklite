import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { comments } from "../server/comments";
import { members } from "../server/identity";
import { createIssue, issues } from "../server/issues";
import { type ProjectKey, projectKeys, projects } from "../server/projects";
import { db } from "../server/shared/db";
import { newRequestId } from "./factories";
import { seedLoadData } from "./seed-load";

async function counts() {
  return {
    projects: await db.$count(projects),
    issues: await db.$count(issues),
    comments: await db.$count(comments),
  };
}

beforeAll(async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  await db.execute(sql`truncate ${members}, ${projectKeys} cascade`);
  await db.insert(projectKeys).values({ key: "LAA" });
  await seedLoadData();
}, 120_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

it("NFR-001: seeds 50 projects, 10,000 issues and 50,000 comments around keys reserved by deleted projects", async () => {
  expect(await counts()).toEqual({ projects: 50, issues: 10_000, comments: 50_000 });
  expect(await db.$count(projects, eq(projects.key, "LAA" as ProjectKey))).toBe(0);
  expect(await db.$count(projectKeys)).toBe(51);
});

it("NFR-002: one board column holds 300 cards and one member has 300 open assigned issues", async () => {
  const [largest] = await db
    .select({ cards: sql<number>`count(*)::int` })
    .from(issues)
    .groupBy(issues.projectId, issues.status)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  const [busiest] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(issues)
    .innerJoin(members, eq(members.id, issues.assigneeId))
    .where(and(isNull(members.deactivatedAt), notInArray(issues.status, ["done", "canceled"])))
    .groupBy(members.id)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  expect(largest.cards).toBeGreaterThanOrEqual(300);
  expect(busiest.open).toBeGreaterThanOrEqual(300);
});

it("NFR-001: an issue created after seeding gets the next number", async () => {
  const [project] = await db.select().from(projects).limit(1);
  const [member] = await db.select().from(members).where(isNull(members.deactivatedAt)).limit(1);
  const [{ highest }] = await db
    .select({ highest: sql<number>`max(${issues.number})::int` })
    .from(issues)
    .where(eq(issues.projectId, project.id));

  const { issue } = await createIssue(member, project.key, {
    requestId: newRequestId(),
    title: "After seeding",
    status: "backlog",
  });

  expect(issue.id).toBe(`${project.key}-${highest + 1}`);
});

it("NFR-001: running twice adds nothing", async () => {
  const before = await counts();

  await seedLoadData();

  expect(await counts()).toEqual(before);
});

it("NFR-001: refuses when NODE_ENV is production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const before = await counts();

  await expect(seedLoadData()).rejects.toThrow("Seeding is for development only");
  expect(await counts()).toEqual(before);
});