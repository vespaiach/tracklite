import * as v from "valibot";
import { from } from "../shared/identifiers";

export type RoleName = "admin" | "member";

export class Role {
  readonly value: RoleName;

  private constructor(value: RoleName) {
    this.value = value;
  }

  static readonly admin = new Role("admin");
  static readonly member = new Role("member");

  static readonly schema = v.pipe(
    v.picklist(["admin", "member"], "Choose admin or member"),
    v.transform((value) => (value === "admin" ? Role.admin : Role.member)),
  );

  static from(raw: unknown) {
    return from(Role, raw);
  }
}