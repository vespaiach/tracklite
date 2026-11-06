import * as v from "valibot";
import { type Role as RoleName, roles } from "../../contract";
import { from } from "../shared/identifiers";

export class Role {
  readonly value: RoleName;

  private constructor(value: RoleName) {
    this.value = value;
  }

  static readonly admin = new Role("admin");
  static readonly member = new Role("member");

  static readonly schema = v.pipe(
    v.picklist(roles, "Choose admin or member"),
    v.transform((value) => (value === "admin" ? Role.admin : Role.member)),
  );

  static from(raw: unknown) {
    return from(Role, raw);
  }
}