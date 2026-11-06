import { BookOpen, Settings, SquareKanban, List as ListIcon, Tag as TagIcon } from "lucide-react";
import { Link } from "react-router";
import { AppBar, AppBarTitle, LinkTabs, Tag } from "../components/ui/track-lite";
import type { ProjectSummary } from "./api";
import { useRouterClick } from "./links";
import { NewIssueButton } from "../app/(signed-in)/project/[key]/NewIssueDialog";
import { useNewIssue } from "./useNewIssue";

export type ProjectView = "board" | "list" | "detail" | "labels";

export type ProjectHeaderProps = { project: ProjectSummary; admin: boolean; view: ProjectView };

export function ProjectHeader({ project, view, admin }: ProjectHeaderProps) {
  const base = `/project/${project.key}`;
  const title = `${project.name} · ${project.key}`;
  return (
    <AppBar
      end={
        <>
          {admin && <SettingsButton href={`${base}/settings`} />}
          {!project.archivedAt && <SpaNewIssueButton project={project} />}
        </>
      }>
      <div className="tl-appbar__lead">
        <DetailsButton
          href={`${base}/detail`}
          current={view === "detail"}
        />
        <AppBarTitle>{title}</AppBarTitle>
      </div>
      {project.archivedAt && <Tag variant="neutral">Archived</Tag>}
      <ViewTabs
        base={base}
        view={view}
      />
    </AppBar>
  );
}

function SpaNewIssueButton({ project }: { project: ProjectSummary }) {
  return (
    <NewIssueButton
      project={project}
      {...useNewIssue()}
    />
  );
}

function DetailsButton({ href, current }: { href: string; current: boolean }) {
  return (
    <Link
      to={href}
      aria-label="Project details"
      title="Project details"
      aria-current={current ? "page" : undefined}
      className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
      <BookOpen size={16} />
    </Link>
  );
}

function SettingsButton({ href }: { href: string }) {
  return (
    <Link
      to={href}
      aria-label="Project settings"
      className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
      <Settings size={15} />
    </Link>
  );
}

function ViewTabs({ base, view }: { base: string; view: ProjectView }) {
  const listClick = useRouterClick(`${base}/list`);
  const labelsClick = useRouterClick(`${base}/labels`);
  return (
    <LinkTabs
      label="Project views"
      variant="soft"
      className="tl-appbar__views"
      options={[
        {
          href: base,
          label: "Board",
          icon: tabIcon(SquareKanban),
          current: view === "board",
        },
        {
          href: `${base}/list`,
          label: "List",
          icon: tabIcon(ListIcon),
          current: view === "list",
          onClick: listClick,
        },
        {
          href: `${base}/labels`,
          label: "Labels",
          icon: tabIcon(TagIcon),
          current: view === "labels",
          onClick: labelsClick,
        },
      ]}
    />
  );
}

function tabIcon(Icon: typeof SquareKanban) {
  return <Icon size={14} />;
}