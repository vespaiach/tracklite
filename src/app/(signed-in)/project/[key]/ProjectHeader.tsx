"use client";

import { BookOpen, List as ListIcon, Settings, SquareKanban, Tag as TagIcon } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "../../../../components/leave-guard";
import { AppBar, AppBarTitle, LinkTabs, Tag } from "../../../../components/ui/track-lite";
import type { Issue } from "../../../../contract";
import { loadPage } from "../../../../lib/load-page";
import { NewIssueButton, type NewIssueProps } from "./NewIssueDialog";

type IssueCrumb = Pick<Issue, "id" | "title">;

export type ProjectHeaderProps = Omit<NewIssueProps, "onCreated"> & { admin: boolean; issue?: IssueCrumb };

export function ProjectHeader({ project, admin, issue, ...newIssue }: ProjectHeaderProps) {
  const segment = useSelectedLayoutSegment() ?? "board";
  const view = issue ? undefined : segment;
  const base = `/project/${project.key}`;
  const title = `${project.name} · ${project.key}`;
  const details = (
    <Link
      href={`${base}/detail`}
      aria-label="Project details"
      title="Project details"
      aria-current={view === "detail" ? "page" : undefined}
      className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
      <BookOpen size={16} />
    </Link>
  );

  if (view === "settings") return null;

  return (
    <AppBar
      end={
        <>
          {admin && (
            <Link
              href={`${base}/settings`}
              aria-label="Project settings"
              className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
              <Settings size={15} />
            </Link>
          )}
          {!project.archivedAt && (
            <NewIssueButton
              project={project}
              {...newIssue}
              onCreated={(id) => loadPage(`/issue/${id}`)}
            />
          )}
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
      <LinkTabs
        label="Project views"
        variant="soft"
        className="tl-appbar__views"
        options={[
          { href: base, label: "Board", icon: <SquareKanban size={14} />, current: view === "board" },
          { href: `${base}/list`, label: "List", icon: <ListIcon size={14} />, current: view === "list" },
          {
            href: `${base}/labels`,
            label: "Labels",
            icon: <TagIcon size={14} />,
            current: view === "labels",
          },
        ]}
      />
    </AppBar>
  );
}

type IssueCrumbsProps = { details: ReactNode; projectTitle: string; projectHref: string; issue: IssueCrumb };

function IssueCrumbs({ details, projectTitle, projectHref, issue }: IssueCrumbsProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="tl-crumbs">
      <span className="tl-crumbs__item tl-appbar__lead">
        {details}
        <Link
          href={projectHref}
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