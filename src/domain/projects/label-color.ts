import * as v from "valibot";
import { type LabelColor as Color, labelColors } from "../../contract";
import { from } from "../shared/identifiers";

export class LabelColor {
  readonly value: Color;

  private constructor(value: Color) {
    this.value = value;
  }

  static readonly schema = v.pipe(
    v.picklist(labelColors, "Choose a color"),
    v.transform((value) => new LabelColor(value)),
  );

  static from(raw: unknown) {
    return from(LabelColor, raw);
  }
}