import type { Username } from "../shared/identifiers";
import type { Member } from "./member";

export type MemberRepository = {
  get(id: string): Promise<Member | undefined>;
  getByUsername(username: Username): Promise<Member | undefined>;
  activeByEmail(normalizedEmail: string): Promise<Member | undefined>;
  lockActiveAdminIds(): Promise<string[]>;
  lockAgainstNewMembers(): Promise<void>;
  count(): Promise<number>;
  add(member: Member): Promise<void>;
  save(member: Member): Promise<void>;
};