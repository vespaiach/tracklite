import type { Username } from "../shared/identifiers";

export type MemberStanding = { id: string; username: string; deactivated: boolean };

export interface MemberDirectory {
  withUsernames(usernames: Username[]): Promise<MemberStanding[]>;
  fullNameOf(memberId: string | null): Promise<string | undefined>;
}