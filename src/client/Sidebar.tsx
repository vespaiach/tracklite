import { Archive, CircleUser, Folder, Inbox, LogOut, Plus, Users } from "lucide-react";
import {
  Avatar,
  Button,
  Lbl,
  Logo,
  Menu,
  MenuItem,
  Rail,
  RailGroup,
  RailLabel,
  RailNote,
  TipTrigger,
} from "../components/ui/track-lite";
import type { MemberSummary, ProjectSummary } from "./api";
import { RouterRailItem } from "./links";
import { Zone, type ZoneState } from "./Zone";

export type SidebarProps = {
  admin: boolean;
  projects: ZoneState<ProjectSummary[]>;
  retryProjects: () => void;
  pathname: string;
  archivedProjectOpen: boolean;
  onNewProject: () => void;
  member?: MemberSummary;
  onProfile: () => void;
  onSignOut: () => void;
};

const iconProps = { size: 15 } as const;

export function Sidebar({
  admin,
  projects,
  retryProjects,
  pathname,
  archivedProjectOpen,
  onNewProject,
  member,
  onProfile,
  onSignOut,
}: SidebarProps) {
  const current = pathname.toLowerCase();
  return (
    <Rail
      head={<Logo size="rail" />}
      foot={
        member && (
          <MemberMenu
            member={member}
            onProfile={onProfile}
            onSignOut={onSignOut}
          />
        )
      }>
      <RailGroup>
        <RouterRailItem
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
                  onClick={onNewProject}>
                  <Plus {...iconProps} />
                </Button>
              </TipTrigger>
            )
          }>
          Projects
        </RailLabel>
        <Zone
          what="projects"
          state={projects}
          retry={retryProjects}>
          {(loaded) => (
            <>
              {loaded.map((project) => {
                const href = `/project/${project.key}`;
                return (
                  <TipTrigger
                    key={project.key}
                    block
                    tip={`${project.name} · ${project.key}`}>
                    <RouterRailItem
                      href={href}
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
                      current={current === href.toLowerCase() || current.startsWith(`${href.toLowerCase()}/`)}
                    />
                  </TipTrigger>
                );
              })}
              {loaded.length === 0 && (
                <RailNote>
                  No projects yet.{" "}
                  {admin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-haspopup="dialog"
                      onClick={onNewProject}>
                      Create one.
                    </Button>
                  )}
                </RailNote>
              )}
            </>
          )}
        </Zone>
        <RouterRailItem
          href="/projects/archived"
          icon={<Archive {...iconProps} />}
          label="Archived projects"
          current={current === "/projects/archived" || archivedProjectOpen}
        />
      </RailGroup>
      {admin && (
        <RailGroup>
          <RouterRailItem
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

type MemberMenuProps = { member: MemberSummary; onProfile: () => void; onSignOut: () => void };

function MemberMenu({ member, onProfile, onSignOut }: MemberMenuProps) {
  return (
    <Menu
      label={member.fullName}
      variant="rail"
      text={
        <>
          <Avatar
            size="md"
            initials={member.initials}
          />
          <Lbl>{member.fullName}</Lbl>
        </>
      }
      onAction={(key) => (key === "profile" ? onProfile() : onSignOut())}>
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