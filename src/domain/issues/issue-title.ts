import * as v from "valibot";
import { from } from "../shared/identifiers";

const maxTitleLength = 200;

export class IssueTitle {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string("Title required"),
    v.trim(),
    v.nonEmpty("Title required"),
    v.check((title) => [...title].length <= maxTitleLength, `Too long (max ${maxTitleLength})`),
    v.transform((value) => new IssueTitle(value)),
  );

  static from(raw: unknown) {
    return from(IssueTitle, raw);
  }
}