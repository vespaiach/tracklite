import { beforeEach, expect, it } from "vitest";
import { createToken } from "../tokens";
import { outbox } from "./outbox";
import { sendEmail } from "./send";
import { invitationEmail, notificationEmail, passwordResetEmail } from "./templates";

beforeEach(() => {
  outbox.sent = [];
  outbox.failing = false;
});

it("spec §9: the password reset email matches the spec word for word", async () => {
  const token = createToken();

  await sendEmail({ to: "sam@acme.com", ...passwordResetEmail({ email: "sam@acme.com", token }) });

  expect(outbox.sent).toEqual([
    {
      to: "sam@acme.com",
      subject: "Reset your Tracklite password",
      text: [
        "Someone asked to reset the password for sam@acme.com on Tracklite.",
        "",
        `Choose a new password: http://localhost:3000/reset-password?token=${token}`,
        "",
        "This link works once and expires in 30 minutes. If you didn't ask for this, ignore this email; your password hasn't changed.",
        "",
        "— Tracklite",
      ].join("\n"),
    },
  ]);
});

it("spec §9: the invitation email matches the spec word for word", async () => {
  const token = createToken();

  await sendEmail({ to: "sam@acme.com", ...invitationEmail({ inviterName: "Alex Kim", token }) });

  expect(outbox.sent).toEqual([
    {
      to: "sam@acme.com",
      subject: "Alex Kim invited you to Tracklite",
      text: [
        "Alex Kim invited you to join their team on Tracklite.",
        "",
        `Accept the invitation: http://localhost:3000/invite?token=${token}`,
        "",
        "This link works once and expires in 7 days. If you weren't expecting this, you can ignore this email.",
        "",
        "— Tracklite",
      ].join("\n"),
    },
  ]);
});

const appUrl = "http://localhost:3000";
const commentId = "0b6c2f1e-7d1a-4c55-9f0e-1a2b3c4d5e6f";

const issueItem = {
  actorName: "Alex Kim",
  issueRef: "WEB-42",
  issueTitle: "Fix login button",
  projectName: "Website",
  projectKey: "WEB",
};

const projectItem = {
  actorName: "Alex Kim",
  issueRef: null,
  issueTitle: null,
  projectName: "Website",
  projectKey: "WEB",
};

const assigned = {
  ...issueItem,
  kind: "assigned" as const,
  commentId: null,
  linkPath: "/issue/WEB-42",
  excerpt: "",
};

const mentionedInIssueComment = {
  ...issueItem,
  kind: "mentioned" as const,
  commentId,
  linkPath: `/issue/WEB-42#comment-${commentId}`,
  excerpt: "@sam can you check?",
};

it("spec §9: an assignment email matches the spec word for word", () => {
  expect(notificationEmail([assigned])).toEqual({
    subject: "[WEB-42] Fix login button: assigned to you by Alex Kim",
    text: [
      "Alex Kim assigned WEB-42 to you in Website.",
      "",
      `${appUrl}/issue/WEB-42`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a mention in an issue description matches the spec word for word", () => {
  const item = {
    ...issueItem,
    kind: "mentioned" as const,
    commentId: null,
    linkPath: "/issue/WEB-42",
    excerpt: "Ask @sam about the layout",
  };

  expect(notificationEmail([item])).toEqual({
    subject: "[WEB-42] Fix login button: Alex Kim mentioned you",
    text: [
      "Alex Kim mentioned you in the description of WEB-42 (Website):",
      "",
      "Ask @sam about the layout",
      "",
      `${appUrl}/issue/WEB-42`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a mention in an issue comment matches the spec word for word", () => {
  expect(notificationEmail([mentionedInIssueComment])).toEqual({
    subject: "[WEB-42] Fix login button: Alex Kim mentioned you",
    text: [
      "Alex Kim mentioned you in a comment on WEB-42 (Website):",
      "",
      "@sam can you check?",
      "",
      `${appUrl}/issue/WEB-42#comment-${commentId}`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a mention in a project description matches the spec word for word", () => {
  const item = {
    ...projectItem,
    kind: "mentioned" as const,
    commentId: null,
    linkPath: "/project/WEB/detail",
    excerpt: "@sam owns the roadmap",
  };

  expect(notificationEmail([item])).toEqual({
    subject: "[WEB] Website: Alex Kim mentioned you",
    text: [
      "Alex Kim mentioned you in the description of project Website:",
      "",
      "@sam owns the roadmap",
      "",
      `${appUrl}/project/WEB/detail`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a mention in a project comment matches the spec word for word", () => {
  const item = {
    ...projectItem,
    kind: "mentioned" as const,
    commentId,
    linkPath: `/project/WEB/detail#comment-${commentId}`,
    excerpt: "@sam thoughts?",
  };

  expect(notificationEmail([item])).toEqual({
    subject: "[WEB] Website: Alex Kim mentioned you",
    text: [
      "Alex Kim mentioned you in a comment on project Website:",
      "",
      "@sam thoughts?",
      "",
      `${appUrl}/project/WEB/detail#comment-${commentId}`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a combined issue email lists each item oldest first, separated by ---", () => {
  expect(notificationEmail([assigned, mentionedInIssueComment])).toEqual({
    subject: "[WEB-42] Fix login button: 2 updates for you",
    text: [
      "Alex Kim assigned WEB-42 to you in Website.",
      "",
      `${appUrl}/issue/WEB-42`,
      "",
      "---",
      "",
      "Alex Kim mentioned you in a comment on WEB-42 (Website):",
      "",
      "@sam can you check?",
      "",
      `${appUrl}/issue/WEB-42#comment-${commentId}`,
      "",
      "— Tracklite",
    ].join("\n"),
  });
});

it("spec §9: a combined project email is titled with the project", () => {
  const description = {
    ...projectItem,
    kind: "mentioned" as const,
    commentId: null,
    linkPath: "/project/WEB/detail",
    excerpt: "@sam owns the roadmap",
  };
  const onComment = { ...description, commentId, linkPath: `/project/WEB/detail#comment-${commentId}` };

  expect(notificationEmail([description, onComment]).subject).toBe("[WEB] Website: 2 updates for you");
});

it("REQ-045: a combined subject uses the newest item's title", () => {
  const renamed = { ...mentionedInIssueComment, issueTitle: "Fix the sign-in button" };

  const { subject, text } = notificationEmail([assigned, renamed]);

  expect(subject).toBe("[WEB-42] Fix the sign-in button: 2 updates for you");
  expect(text.startsWith("Alex Kim assigned WEB-42 to you in Website.")).toBe(true);
});