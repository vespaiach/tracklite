import * as v from "valibot";
import { issueStatuses, type IssueStatus as Status } from "../../contract";
import { from } from "../shared/identifiers";

export class IssueStatus {
  readonly value: Status;

  private constructor(value: Status) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.picklist(issueStatuses, "Choose a status"),
    v.transform((value) => new IssueStatus(value)),
  );

  static from(raw: unknown) {
    return from(IssueStatus, raw);
  }
}