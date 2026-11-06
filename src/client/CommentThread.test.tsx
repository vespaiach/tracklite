import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { alex, memberOf, mockApi, project, renderAppAt, sam } from "../test/client-app";
import type { ThreadComment } from "./api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("REQ-032.2: a project's comments are on its details page", async () => {
  const kickoff: ThreadComment = {
    id: "c-1",
    body: "Scope is in the description.",
    author: memberOf(alex),
    createdAt: new Date().toISOString(),
    editedAt: null,
    version: 1,
    mentions: [],
  };
  mockApi({
    "GET /api/me": () => Response.json(sam),
    "GET /api/members": () => Response.json([alex, sam]),
    "GET /api/projects/WEB": () => Response.json(project("WEB", "Website")),
    "GET /api/projects/WEB/comments": () => Response.json([kickoff]),
  });
  renderAppAt("/project/WEB/detail");

  expect(await screen.findByText("Scope is in the description.")).toBeTruthy();
  const thread = await screen.findByRole("region", { name: "Comments" });
  expect(within(thread).getAllByRole("article")).toHaveLength(1);
});