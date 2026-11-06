"use client";

import { Archive, CircleUser, Folder, Inbox, LogOut, Plus, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { confirmLeave } from "../../components/leave-guard";
import { useToast } from "../../components/toast";
import {
  AppShell,
  Avatar,
  Button,
  Lbl,
  Logo,
  Menu,
  MenuItem,
  Rail,
  RailGroup,
  RailItem,
  RailLabel,
  RailNote,
  TipTrigger,
} from "../../components/ui/track-lite";
import type { FormAction, Me, ProjectSummary } from "../../contract";
import { loadPage } from "../../lib/load-page";
import { type CreateProject, NewProjectDialog } from "./NewProjectDialog";

type ShellProps = {
  me: Me;
  projects: ReactNode;
  createProject: CreateProject;
  signOut: FormAction;
  children: ReactNode;
};

type SidebarState = {
  admin: boolean;
  current: string;
  openNewProject: () => void;
  showArchived: (keys: string[]) => void;
};

const SidebarContext = createContext<SidebarState>({
  admin: false,
  current: "",
  openNewProject: () => {},
  showArchived: () => {},
});

const iconProps = { size: 15 } as const;

export function Shell({ me, projects, createProject, signOut, children }: ShellProps) {
  const [creating, setCreating] = useState(false);
  const [archivedKeys, setArchivedKeys] = useState<string[]>([]);
  const current = usePathname().toLowerCase();
  const admin = me.role === "admin";

  return (
    <SidebarContext
      value={{ admin, current, openNewProject: () => setCreating(true), showArchived: setArchivedKeys }}>
      <AppShell
        rail={
          <Sidebar
            me={me}
            projects={projects}
            archivedProjectOpen={archivedKeys.some((key) => isInProjectOrIssue(current, key))}
            signOut={signOut}
          />
        }>
        {children}
      </AppShell>
      {creating && (
        <NewProjectDialog
          createProject={createProject}
          onClose={() => setCreating(false)}
        />
      )}
    </SidebarContext>
  );
}

function isInProject(current: string, key: string) {
  const lower = key.toLowerCase();
  return current === `/project/${lower}` || current.startsWith(`/project/${lower}/`);
}

function isInProjectOrIssue(current: string, key: string) {
  return isInProject(current, key) || current.startsWith(`/issue/${key.toLowerCase()}-`);
}

type SidebarProps = { me: Me; projects: ReactNode; archivedProjectOpen: boolean; signOut: FormAction };

function Sidebar({ me, projects, archivedProjectOpen, signOut }: SidebarProps) {
  const { admin, current, openNewProject } = useContext(SidebarContext);

  return (
    <Rail
      head={<Logo size="rail" />}
      foot={
        <MemberMenu
          me={me}
          signOut={signOut}
        />
      }>
      <RailGroup>
        <RailItem
          href="/my-issues"
          icon={<Inbox {...iconProps} />}
          label="My issues"
          current={current === "/my-issues"}
        />
      </RailGroup>
      <RailGroup>
        <RailLabel
          action={
            admin && (
              <TipTrigger tip="New project">
                <Button
                  variant="quiet"
                  size="sm"
                  icon
                  aria-label="New project"
                  aria-haspopup="dialog"
                  onClick={openNewProject}>
                  <Plus {...iconProps} />
                </Button>
              </TipTrigger>
            )
          }>
          Projects
        </RailLabel>
        {projects}
        <RailItem
          href="/projects/archived"
          icon={<Archive {...iconProps} />}
          label="Archived projects"
          current={current === "/projects/archived" || archivedProjectOpen}
        />
      </RailGroup>
      {admin && (
        <RailGroup>
          <RailItem
            href="/settings/members"
            icon={<Users {...iconProps} />}
            label="Members"
            current={current === "/settings/members" || current === "/settings/notifications"}
          />
        </RailGroup>
      )}
    </Rail>
  );
}

export function ProjectLinks({
  projects,
  archivedKeys,
}: {
  projects: ProjectSummary[];
  archivedKeys: string[];
}) {
  const { admin, current, openNewProject, showArchived } = useContext(SidebarContext);
  const archived = archivedKeys.join(" ");

  useEffect(() => showArchived(archived === "" ? [] : archived.split(" ")), [archived, showArchived]);

  return (
    <>
      {projects.map((project) => (
        <TipTrigger
          key={project.key}
          block
          tip={`${project.name} · ${project.key}`}>
          <RailItem
            href={`/project/${project.key}`}
            icon={
              <Folder
                size={14}
                className="tl-rail-item__folder"
              />
            }
            label={project.name}
            suffix={` · ${project.key}`}
            title=""
            aria-label={`${project.name} · ${project.key}`}
            current={isInProject(current, project.key)}
          />
        </TipTrigger>
      ))}
      {projects.length === 0 && (
        <RailNote>
          No projects yet.{" "}
          {admin && (
            <Button
              variant="ghost"
              size="sm"
              aria-haspopup="dialog"
              onClick={openNewProject}>
              Create one.
            </Button>
          )}
        </RailNote>
      )}
    </>
  );
}

const couldNotSignOut = "Couldn’t save. Try again.";

function openProfile() {
  if (confirmLeave()) loadPage("/settings/profile");
}

function MemberMenu({ me, signOut }: { me: Me; signOut: FormAction }) {
  const toast = useToast();

  async function signOutAndLeave() {
    if (!confirmLeave()) return;

    try {
      await signOut(new FormData());
    } catch {
      return toast(couldNotSignOut);
    }

    loadPage("/sign-in");
  }

  return (
    <Menu
      label={me.fullName}
      variant="rail"
      text={
        <>
          <Avatar
            size="md"
            initials={me.initials}
          />
          <Lbl>{me.fullName}</Lbl>
        </>
      }
      onAction={(key) => (key === "profile" ? openProfile() : signOutAndLeave())}>
      <MenuItem
        id="profile"
        icon={<CircleUser size={14} />}>
        Profile
      </MenuItem>
      <MenuItem
        id="sign-out"
        icon={<LogOut size={14} />}>
        Sign out
      </MenuItem>
    </Menu>
  );
}