import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { MemberDirectory } from "../../domain/identity/member-directory";
import type { Username } from "../../domain/shared/identifiers";
import type { Transaction } from "../transaction";
import type { TransactionScope } from "../unit-of-work";
import { members } from "./tables";

export function drizzleMemberDirectory({ tx }: TransactionScope): MemberDirectory {
  return {
    withUsernames: (usernames) => withUsernames(tx, usernames),

    fullNameOf: (memberId) => fullNameOf(tx, memberId),
  };
}

async function withUsernames(tx: Transaction, usernames: Username[]) {
  if (usernames.length === 0) return [];
  const rows = await tx
    .select({ id: members.id, username: members.username, deactivatedAt: members.deactivatedAt })
    .from(members)
    .where(
      inArray(
        members.username,
        usernames.map((username) => username.value),
      ),
    );
  return rows.map(({ id, username, deactivatedAt }) => ({
    id,
    username,
    deactivated: deactivatedAt !== null,
  }));
}

export async function fullNameOf(tx: Transaction, memberId: string | null) {
  if (!memberId) return undefined;
  const [editor] = await tx
    .select({ fullName: members.fullName })
    .from(members)
    .where(eq(members.id, memberId));
  return editor?.fullName;
}