import type { ReactElement } from "react";
import { expect, it } from "vitest";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { requestPathHeader } from "../../../../proxy";
import { createIssue, createMember, createProject } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import IssuePage from "./page";

type Rendered = ReactElement<{ children: ReactElement<Record<string, unknown>>[] }>;

type ViewElement = ReactElement<Record<string, unknown> & { comments: ReactElement<{ what: string }> }>;

async function visit(typedId: string, path: string | undefined, role: "admin" | "member" = "member") {
  const member = await createMember({ role });
  setNextRequest({
    cookies: { [sessionCookieName()]: await createSession(member.id) },
    headers: path === undefined ? {} : { [requestPathHeader]: path },
  });
  return IssuePage({
    params: Promise.resolve({ id: typedId }),
    searchParams: Promise.resolve({}),
  }) as Promise<Rendered>;
}

async function issueIn(project: { id: string; key: string }) {
  const issue = await createIssue(project.id);
  return { ...issue, displayId: `${project.key}-${issue.number}` };
}

it("STD-4: an unknown or malformed issue ID shows Not found", async () => {
  const project = await createProject();

  for (const id of [`${project.key}-999`, "nonsense", `${project.key}-0x1`]) {
    await expect(visit(id, `/issue/${id}`)).rejects.toThrow("NEXT_NOT_FOUND");
  }
});

it("REQ-016.5: an issue address in lower case redirects to the canonical ID, keeping the query", async () => {
  const project = await createProject();
  const issue = await issueIn(project);
  const typed = issue.displayId.toLowerCase();

  for (const [path, canonical] of [
    [`/issue/${typed}?x=1`, `/issue/${issue.displayId}?x=1`],
    [undefined, `/issue/${issue.displayId}`],
  ]) {
    await expect(visit(typed, path)).rejects.toMatchObject({ url: canonical });
  }
});

it("REQ-046, STD-11, STD-11.1: the canonical address renders the project header above the issue's region, with the comments in a region of their own", async () => {
  const project = await createProject({ name: "Website" });
  const issue = await issueIn(project);

  const [header, region] = (await visit(issue.displayId, `/issue/${issue.displayId}`, "admin")).props
    .children;

  expect(header.props).toMatchObject({
    project: { key: project.key, name: "Website" },
    issue: { id: issue.displayId, title: issue.title },
    admin: true,
  });
  expect(region.props).toMatchObject({ what: "this issue" });

  const details = region.props.children as unknown as Rendered;
  const view = await (details.type as (props: unknown) => Promise<ViewElement>)(details.props);
  expect(view.props).toMatchObject({ issue: { id: issue.displayId }, me: { admin: true } });
  expect(view.props.comments.props.what).toBe("comments");
});