import type { ReactElement, ReactNode } from "react";
import { expect, it } from "vitest";
import { createSession, sessionCookieName } from "../../../infrastructure/identity/session";
import { createMember } from "../../../test/factories";
import { setNextRequest } from "../../../test/next-request";
import { Region } from "../../../components/region/Region";
import { Members } from "./members/Members";
import MembersPage from "./members/page";
import { NotificationStatusBar, StatsReport } from "./notifications/NotificationStatus";
import NotificationStatusPage from "./notifications/page";
import ProfilePage from "./profile/page";
import { Profile } from "./profile/Profile";
import { NoPermission, SettingsTitle } from "./SettingsTitle";

type Element = ReactElement<{ children?: ReactNode } & Record<string, unknown>>;

async function signedInAs(role: "admin" | "member", fullName = "Sam Lee") {
  const member = await createMember({ role, fullName });
  setNextRequest({ cookies: { [sessionCookieName()]: await createSession(member.id) } });
  return member;
}

async function parts(page: Promise<unknown>) {
  return ((await page) as Element).props.children as Element[];
}

async function regionContent(region: Element) {
  const loader = region.props.children as ReactElement<Record<string, unknown>>;
  return (await (loader.type as (props: unknown) => Promise<unknown>)(loader.props)) as Element;
}

it("REQ-003.3: the profile page shows the signed-in member's own profile", async () => {
  const sam = await signedInAs("member");

  const page = (await ProfilePage()) as Element;

  expect(page.type).toBe(Profile);
  expect(page.props.me).toEqual({
    username: sam.username,
    fullName: "Sam Lee",
    initials: "SL",
    deactivated: false,
    email: sam.email,
    role: "member",
  });
});

it("REQ-051.2, REQ-053.8, STD-2: a member opening Members or Notification status sees no permission and nothing is read", async () => {
  await signedInAs("member");

  for (const [page, title] of [
    [MembersPage(), "Members"],
    [NotificationStatusPage(), "Notification status"],
  ] as const) {
    const [heading, body] = await parts(page);
    expect(heading.type).toBe(SettingsTitle);
    expect(heading.props.title).toBe(title);
    expect(body.type).toBe(NoPermission);
  }
});

it("REQ-051.1: an admin's members page reads every member with email and role, and the open invitations", async () => {
  const alex = await signedInAs("admin", "Alex Kim");

  const [heading, region] = await parts(MembersPage());
  const members = await regionContent(region);

  expect(heading.props.title).toBe("Members");
  expect(region.type).toBe(Region);
  expect(members.type).toBe(Members);
  expect(members.props.you).toBe(alex.username);
  expect(members.props.members).toContainEqual(
    expect.objectContaining({ username: alex.username, email: alex.email, role: "admin" }),
  );
  expect(members.props.invitations).toEqual(expect.any(Array));
});

it("REQ-053, REQ-053.7: an admin's notification status page has the Refresh bar and reads the stats inside a region", async () => {
  await signedInAs("admin");

  const [bar, region] = await parts(NotificationStatusPage());
  const report = await regionContent(region);

  expect(bar.type).toBe(NotificationStatusBar);
  expect(region.type).toBe(Region);
  expect(report.type).toBe(StatsReport);
  expect(report.props.stats).toMatchObject({ queue: expect.any(Object), channels: expect.any(Array) });
});