import { Archive } from "@phosphor-icons/react/dist/csr/Archive";
import { Tray } from "@phosphor-icons/react/dist/csr/Tray";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import {
  Avatar,
  Button,
  Glyph,
  Lbl,
  Logo,
  Menu,
  MenuItem,
  Rail,
  RailGroup,
  RailLabel,
  RailLabelAction,
  RailNote,
  TipTrigger,
} from "../components/ui/track-lite";
import type { MemberSummary, ProjectSummary } from "./api";
import { RouterRailItem } from "./links";

export type SidebarProps = {
  admin: boolean;
  projects?: ProjectSummary[];
  pathname: string;
  archivedProjectOpen: boolean;
  onNewProject: () => void;
  member?: MemberSummary;
  onProfile: () => void;
  onSignOut: () => void;
};

const iconProps = { size: 15, weight: "duotone" } as const;

export function Sidebar({
  admin,
  projects,
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
          icon={<Tray {...iconProps} />}
          label="My issues"
          current={current === "/my-issues"}
        />
      </RailGroup>
      <RailGroup>
        <RailLabel
          action={
            admin && (
              <TipTrigger tip="New project">
                <RailLabelAction
                  label="New project"
                  aria-haspopup="dialog"
                  onClick={onNewProject}
                />
              </TipTrigger>
            )
          }>
          Projects
        </RailLabel>
        {projects?.map((project) => {
          const href = `/project/${project.key}`;
          return (
            <TipTrigger
              key={project.key}
              block
              tip={`${project.name} · ${project.key}`}>
              <RouterRailItem
                href={href}
                icon={<Glyph kind="sq" />}
                label={project.name}
                suffix={` · ${project.key}`}
                title=""
                aria-label={`${project.name} · ${project.key}`}
                current={current === href.toLowerCase() || current.startsWith(`${href.toLowerCase()}/`)}
              />
            </TipTrigger>
          );
        })}
        {projects?.length === 0 && (
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
      <MenuItem id="profile">Profile</MenuItem>
      <MenuItem id="sign-out">Sign out</MenuItem>
    </Menu>
  );
}