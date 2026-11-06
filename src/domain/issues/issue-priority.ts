import * as v from "valibot";
import { issuePriorities, type IssuePriority as Priority } from "../../contract";
import { from } from "../shared/identifiers";

export class IssuePriority {
  readonly value: Priority;

  private constructor(value: Priority) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.picklist(issuePriorities, "Choose a priority"),
    v.transform((value) => new IssuePriority(value)),
  );

  static from(raw: unknown) {
    return from(IssuePriority, raw);
  }
}