"use client";

import { BookOpen, List as ListIcon, Settings, SquareKanban, Tag as TagIcon } from "lucide-react";
import { useSelectedLayoutSegment } from "next/navigation";
import { AppBar, AppBarTitle, LinkTabs, Tag } from "../../../../components/ui/track-lite";
import { loadPage } from "../../../../lib/load-page";
import { NewIssueButton, type NewIssueProps } from "./NewIssueDialog";

export type ProjectHeaderProps = Omit<NewIssueProps, "onCreated"> & { admin: boolean };

export function ProjectHeader({ project, admin, ...newIssue }: ProjectHeaderProps) {
  const view = useSelectedLayoutSegment() ?? "board";
  const base = `/project/${project.key}`;

  if (view === "settings") return null;

  return (
    <AppBar
      end={
        <>
          {admin && (
            <a
              href={`${base}/settings`}
              aria-label="Project settings"
              className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
              <Settings size={15} />
            </a>
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
      <div className="tl-appbar__lead">
        <a
          href={`${base}/detail`}
          aria-label="Project details"
          title="Project details"
          aria-current={view === "detail" ? "page" : undefined}
          className="tl-btn tl-btn--sm tl-btn--quiet tl-btn--icon">
          <BookOpen size={16} />
        </a>
        <AppBarTitle>{`${project.name} · ${project.key}`}</AppBarTitle>
      </div>
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