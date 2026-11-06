import { BookOpen, Settings, SquareKanban, List as ListIcon, Tag as TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AppBar, LinkTabs, Tag } from "../components/ui/track-lite";
import type { Issue, ProjectSummary } from "./api";
import { NewIssueButton } from "../app/(signed-in)/project/[key]/NewIssueDialog";
import { useNewIssue } from "./useNewIssue";

type IssueCrumb = Pick<Issue, "id"> & Partial<Pick<Issue, "title">>;

export type ProjectHeaderProps = { project: ProjectSummary; admin: boolean; issue: IssueCrumb };

export function ProjectHeader({ project, issue, admin }: ProjectHeaderProps) {
  const base = `/project/${project.key}`;
  const title = `${project.name} · ${project.key}`;
  const details = <DetailsButton href={`${base}/detail`} />;
  return (
    <AppBar
      end={
        <>
          {admin && <SettingsButton href={`${base}/settings`} />}
          {!project.archivedAt && <SpaNewIssueButton project={project} />}
        </>
      }>
      <IssueCrumbs
        details={details}
        projectTitle={title}
        projectHref={base}
        issue={issue}
      />
      {project.archivedAt && <Tag variant="neutral">Archived</Tag>}
      <ViewTabs base={base} />
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

function DetailsButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      aria-label="Project details"
      title="Project details"
      className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
      <BookOpen size={16} />
    </a>
  );
}

function SettingsButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      aria-label="Project settings"
      className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
      <Settings size={15} />
    </a>
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
        <a
          href={projectHref}
          className="tl-appbar__title">
          {projectTitle}
        </a>
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

function ViewTabs({ base }: { base: string }) {
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
        },
        {
          href: `${base}/list`,
          label: "List",
          icon: tabIcon(ListIcon),
        },
        {
          href: `${base}/labels`,
          label: "Labels",
          icon: tabIcon(TagIcon),
        },
      ]}
    />
  );
}

function tabIcon(Icon: typeof SquareKanban) {
  return <Icon size={14} />;
}