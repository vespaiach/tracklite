import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ChoiceProps = Omit<ComponentProps<"input">, "type"> & { label?: ReactNode };

export function Radio({ label, className, ...rest }: ChoiceProps & { label: ReactNode }) {
  return (
    <label className={cx("tl-radio", className)}>
      <input
        type="radio"
        className="sr-only"
        {...rest}
      />
      <span className="tl-radio__dot" />
      {label}
    </label>
  );
}

export function Checkbox({ label, className, ...rest }: ChoiceProps) {
  return (
    <label className={cx("tl-check", className)}>
      <input
        type="checkbox"
        className="sr-only"
        {...rest}
      />
      <span className="tl-check__box" />
      {label}
    </label>
  );
}

export type SegmentedProps<T extends string> = {
  name: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  className?: string;
};

export function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  compact,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      className={cx("tl-seg", compact && "tl-seg--compact", className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className="tl-seg__opt"
          data-on={value === option.value || undefined}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}