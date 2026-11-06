import type { ReactElement } from "react";
import { expect, it } from "vitest";
import { createSession, sessionCookieName } from "../../../../infrastructure/identity/session";
import { requestPathHeader } from "../../../../proxy";
import { createMember, createProject } from "../../../../test/factories";
import { setNextRequest } from "../../../../test/next-request";
import ProjectLayout from "./layout";
import BoardPage from "./page";

type Rendered = ReactElement<{ children: [ReactElement<Record<string, unknown>>, string] }>;

async function visit(typedKey: string, path: string | undefined, role: "admin" | "member" = "member") {
  const member = await createMember({ role });
  setNextRequest({
    cookies: { [sessionCookieName()]: await createSession(member.id) },
    headers: path === undefined ? {} : { [requestPathHeader]: path },
  });
  const params = Promise.resolve({ key: typedKey });
  return {
    member,
    layout: () => ProjectLayout({ children: "the page", params }) as Promise<Rendered>,
    params,
  };
}

it("STD-4: an unknown or malformed project key shows Not found, from the layout and from the board page", async () => {
  for (const key of ["NOPE", "Q1"]) {
    const { layout, params } = await visit(key, `/project/${key}`);

    await expect(layout()).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(BoardPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  }
});

it("REQ-016.5, API-004: a project address in lower case redirects to the canonical key, keeping the rest of the path and the query", async () => {
  const project = await createProject();
  const typed = project.key.toLowerCase();

  for (const [path, canonical] of [
    [`/project/${typed}`, `/project/${project.key}`],
    [`/project/${typed}/list?status=done`, `/project/${project.key}/list?status=done`],
    [undefined, `/project/${project.key}`],
  ]) {
    const { layout } = await visit(typed, path);

    await expect(layout()).rejects.toMatchObject({ url: canonical });
  }
});

it("REQ-046.1, STD-2: the canonical address renders the project header above the page, with the settings gear for an admin only", async () => {
  const project = await createProject({ name: "Website" });

  const asAdmin = await visit(project.key, `/project/${project.key}`, "admin");
  const [header, page] = (await asAdmin.layout()).props.children;
  expect(page).toBe("the page");
  expect(header.props).toMatchObject({
    project: { key: project.key, name: "Website", archivedAt: null },
    admin: true,
    me: asAdmin.member.username,
  });
  expect(header.props.members).toContainEqual(expect.objectContaining({ username: asAdmin.member.username }));

  const asMember = await visit(project.key, `/project/${project.key}`);
  expect((await asMember.layout()).props.children[0].props).toMatchObject({ admin: false });
});