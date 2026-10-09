import "server-only";
import { randomUUID } from "node:crypto";
import { asc, isNull, like } from "drizzle-orm";
import { generateNKeysBetween } from "fractional-indexing";
import { db } from "./db";
import { issuePriorities, issueStatuses } from "../contract";
import { comments, issues, members, projectKeys, projects } from "./schema";
import { seedMembers } from "./seed";

const projectCount = 50;
const busyProjectIssues = 690;
const otherProjectIssues = 190;
const busyColumnCards = 300;
const commentsPerIssue = 5;
const chunkSize = 1000;

const verbs = ["Fix", "Add", "Update", "Remove", "Refactor", "Document", "Test", "Speed up"];
const subjects = [
  "sign-in form",
  "board drag",
  "email footer",
  "search box",
  "label picker",
  "settings page",
];

const loadProjectName = "Load test";
const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const candidateKeys = letters.flatMap((second) => letters.map((third) => `L${second}${third}`));

function chunks<T>(rows: T[]) {
  return Array.from({ length: Math.ceil(rows.length / chunkSize) }, (_, index) =>
    rows.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}

function plannedIssues(projectIndex: number) {
  const count = projectIndex === 0 ? busyProjectIssues : otherProjectIssues;
  return Array.from({ length: count }, (_, index) => {
    const inBusyColumn = projectIndex === 0 && index < busyColumnCards;
    return {
      number: index + 1,
      status: inBusyColumn ? "backlog" : issueStatuses[index % issueStatuses.length],
      inBusyColumn,
    };
  });
}

export async function seedLoadData() {
  if (process.env.NODE_ENV === "production") throw new Error("Seeding is for development only");

  await seedMembers();
  const existing = await db.$count(projects, like(projects.name, `${loadProjectName} %`));
  if (existing > 0) return { seeded: false };

  const reserved = new Set((await db.select().from(projectKeys)).map(({ key }) => key));
  const loadProjectKeys = candidateKeys.filter((key) => !reserved.has(key)).slice(0, projectCount);

  const people = await db
    .select({ id: members.id })
    .from(members)
    .where(isNull(members.deactivatedAt))
    .orderBy(asc(members.username));
  const [busiest, ...others] = people;

  await db.transaction(async (tx) => {
    await tx.insert(projectKeys).values(loadProjectKeys.map((key) => ({ key })));

    for (const [projectIndex, key] of loadProjectKeys.entries()) {
      const planned = plannedIssues(projectIndex);
      const [project] = await tx
        .insert(projects)
        .values({ key, name: `${loadProjectName} ${key}`, nextIssueNumber: planned.length + 1 })
        .returning({ id: projects.id });

      const positions = new Map(
        issueStatuses.map((status) => {
          const cards = planned.filter((issue) => issue.status === status).length;
          return [status, generateNKeysBetween(null, null, cards)];
        }),
      );
      const issueRows = planned.map(({ number, status, inBusyColumn }) => ({
        projectId: project.id,
        number,
        title: `${verbs[number % verbs.length]} ${subjects[number % subjects.length]} ${number}`,
        description: `Load test issue ${key}-${number}.`,
        status,
        priority: issuePriorities[number % issuePriorities.length],
        assigneeId: inBusyColumn ? busiest.id : number % 4 === 0 ? null : others[number % others.length].id,
        position: positions.get(status)?.shift() ?? "",
        createdBy: people[number % people.length].id,
        requestId: randomUUID(),
      }));

      for (const chunk of chunks(issueRows)) {
        const inserted = await tx.insert(issues).values(chunk).returning({ id: issues.id });
        const commentRows = inserted.flatMap(({ id }, issueIndex) =>
          Array.from({ length: commentsPerIssue }, (_, index) => ({
            issueId: id,
            authorId: people[(issueIndex + index) % people.length].id,
            body: `Load test comment ${index + 1}.`,
            requestId: randomUUID(),
          })),
        );
        for (const commentChunk of chunks(commentRows)) await tx.insert(comments).values(commentChunk);
      }
    }
  });
  return { seeded: true };
}