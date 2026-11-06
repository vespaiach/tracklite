import * as v from "valibot";
import { from } from "../shared/identifiers";

const maxLength = 60;

export class FullName {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.string("Name required"),
    v.trim(),
    v.nonEmpty("Name required"),
    v.check((text) => [...text].length <= maxLength, `Too long (max ${maxLength})`),
    v.transform((value) => new FullName(value)),
  );

  static from(raw: unknown) {
    return from(FullName, raw);
  }

  static rehydrate(value: string) {
    return new FullName(value);
  }
}