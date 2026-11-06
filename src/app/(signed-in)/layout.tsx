import type { ReactNode } from "react";
import { Region } from "../../components/region/Region";
import type { Member } from "../../infrastructure/identity/tables";
import { listProjects, profileResponse } from "../../queries";
import { signOut } from "../(signed-out)/actions";
import { signedInPageMember } from "../_server/session";
import { createProject } from "./actions";
import { ProjectLinks, Shell } from "./Shell";

export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const member = await signedInPageMember();

  return (
    <Shell
      me={profileResponse(member)}
      projects={
        <Region what="projects">
          <SidebarProjects member={member} />
        </Region>
      }
      createProject={createProject}
      signOut={signOut}>
      {children}
    </Shell>
  );
}

async function SidebarProjects({ member }: { member: Member }) {
  const [active, archived] = await Promise.all([listProjects(member, false), listProjects(member, true)]);

  return (
    <ProjectLinks
      projects={active}
      archivedKeys={archived.map((project) => project.key)}
    />
  );
}