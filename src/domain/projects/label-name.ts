import * as v from "valibot";
import { from } from "../shared/identifiers";

const maxNameLength = 30;

export class LabelName {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string("Name required"),
    v.trim(),
    v.nonEmpty("Name required"),
    v.check((name) => [...name].length <= maxNameLength, `Too long (max ${maxNameLength})`),
    v.transform((value) => new LabelName(value)),
  );

  static from(raw: unknown) {
    return from(LabelName, raw);
  }
}