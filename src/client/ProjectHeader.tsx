import { Gear } from "@phosphor-icons/react/dist/csr/Gear";
import { Link } from "react-router";
import { AppBar, AppBarTitle, LinkTabs, Tag } from "../components/ui/track-lite";
import type { ProjectSummary } from "./api";
import { useRouterClick } from "./links";

export type ProjectView = "board" | "list" | "labels";

export type ProjectHeaderProps = {
  project: ProjectSummary;
  view: ProjectView;
  admin: boolean;
};

export function ProjectHeader({ project, view, admin }: ProjectHeaderProps) {
  const base = `/project/${project.key}`;
  const boardClick = useRouterClick(base);
  const listClick = useRouterClick(`${base}/list`);
  return (
    <AppBar
      end={
        admin && (
          <Link
            to={`${base}/settings`}
            aria-label="Project settings"
            className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
            <Gear
              size={15}
              weight="duotone"
            />
          </Link>
        )
      }>
      <AppBarTitle>{`${project.name} · ${project.key}`}</AppBarTitle>
      {project.archivedAt && <Tag variant="neutral">Archived</Tag>}
      <Link
        to={`${base}/detail`}
        className="tl-navlink">
        Details
      </Link>
      <LinkTabs
        label="Project views"
        options={[
          { href: base, label: "Board", current: view === "board", onClick: boardClick },
          { href: `${base}/list`, label: "List", current: view === "list", onClick: listClick },
        ]}
      />
      <Link
        to={`${base}/labels`}
        aria-current={view === "labels" ? "page" : undefined}
        className="tl-navlink">
        Labels
      </Link>
    </AppBar>
  );
}