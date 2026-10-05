import { Archive } from "@phosphor-icons/react/dist/csr/Archive";
import { Stack } from "@phosphor-icons/react/dist/csr/Stack";
import { Tray } from "@phosphor-icons/react/dist/csr/Tray";
import { Users } from "@phosphor-icons/react/dist/csr/Users";
import {
  Button,
  Rail,
  RailGroup,
  RailLabel,
  RailLabelAction,
  SettingsEmpty,
  TipTrigger,
} from "../components/ui/track-lite";
import type { ProjectSummary } from "./api";
import { RouterRailItem } from "./links";

export type SidebarProps = {
  admin: boolean;
  projects?: ProjectSummary[];
  pathname: string;
  onNewProject: () => void;
};

const iconProps = { size: 15, weight: "duotone" } as const;

export function Sidebar({ admin, projects, pathname, onNewProject }: SidebarProps) {
  const current = pathname.toLowerCase();
  return (
    <Rail head={<span className="tl-nav__brand">Tracklite</span>}>
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
                icon={<Stack {...iconProps} />}
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
          <SettingsEmpty>
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
          </SettingsEmpty>
        )}
      </RailGroup>
      <RailGroup>
        <RouterRailItem
          href="/projects/archived"
          icon={<Archive {...iconProps} />}
          label="Archived projects"
          current={current === "/projects/archived"}
        />
        {admin && (
          <RouterRailItem
            href="/settings/members"
            icon={<Users {...iconProps} />}
            label="Members"
            current={current === "/settings/members"}
          />
        )}
      </RailGroup>
    </Rail>
  );
}