import { BookOpen, Settings, SquareKanban, List as ListIcon, Tag as TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { AppBar, AppBarTitle, LinkTabs, Tag } from "../components/ui/track-lite";
import type { Issue, ProjectSummary } from "./api";
import { useRouterClick } from "./links";
import { NewIssueButton } from "./NewIssueDialog";

export type ProjectView = "board" | "list" | "detail" | "labels";

type IssueCrumb = Pick<Issue, "id"> & Partial<Pick<Issue, "title">>;

export type ProjectHeaderProps = {
  project: ProjectSummary;
  admin: boolean;
} & ({ view: ProjectView; issue?: never } | { issue: IssueCrumb; view?: never });

export function ProjectHeader({ project, view, issue, admin }: ProjectHeaderProps) {
  const base = `/project/${project.key}`;
  const title = `${project.name} · ${project.key}`;
  const details = (
    <DetailsButton
      href={`${base}/detail`}
      current={view === "detail"}
    />
  );
  return (
    <AppBar
      end={
        <>
          {admin && <SettingsButton href={`${base}/settings`} />}
          {!project.archivedAt && <NewIssueButton project={project} />}
        </>
      }>
      {issue ? (
        <IssueCrumbs
          details={details}
          projectTitle={title}
          projectHref={base}
          issue={issue}
        />
      ) : (
        <div className="tl-appbar__lead">
          {details}
          <AppBarTitle>{title}</AppBarTitle>
        </div>
      )}
      {project.archivedAt && <Tag variant="neutral">Archived</Tag>}
      <ViewTabs
        base={base}
        view={view}
      />
    </AppBar>
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

type IssueCrumbsProps = {
  details: ReactNode;
  projectTitle: string;
  projectHref: string;
  issue: IssueCrumb;
};

function IssueCrumbs({ details, projectTitle, projectHref, issue }: IssueCrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="tl-crumbs">
      <span className="tl-crumbs__item tl-appbar__lead">
        {details}
        <Link
          to={projectHref}
          className="tl-appbar__title">
          {projectTitle}
        </Link>
      </span>
      <span className="tl-crumbs__item">
        <span
          className="tl-crumbs__sep"
          aria-hidden="true">
          /
        </span>
        <span
          aria-current="page"
          title={issue.title}
          className="tl-crumbs__id">
          {issue.id}
        </span>
      </span>
    </nav>
  );
}

function ViewTabs({ base, view }: { base: string; view?: ProjectView }) {
  const boardClick = useRouterClick(base);
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
          onClick: boardClick,
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