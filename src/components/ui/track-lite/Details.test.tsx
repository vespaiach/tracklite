import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CountRow, DetailsSection } from "./Details";
import { Status } from "./Status";

afterEach(cleanup);

it("DetailsSection is a region named by its heading; CountRow hides its icon from its link name", () => {
  render(
    <DetailsSection
      title="Issues"
      aside="4 open">
      <CountRow
        href="/project/WEB/list?status=backlog"
        label="Backlog, 3 issues. Open list view"
        icon={<Status status="backlog" />}
        name="Backlog"
        count={3}
      />
    </DetailsSection>,
  );

  const section = screen.getByRole("region", { name: "Issues" });
  expect(section.textContent).toBe("Issues4 openBacklog3");
  const row = screen.getByRole("link", { name: "Backlog, 3 issues. Open list view" });
  expect(row.querySelector(".tl-status")?.closest("[aria-hidden='true']")).toBeTruthy();
});