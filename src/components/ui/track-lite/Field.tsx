import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "./cx";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      className={cx("tl-input", className)}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx("tl-input", className)}
      {...rest}
    />
  );
}

export function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p
      id={id}
      className="tl-field-error">
      <span
        aria-hidden="true"
        className="tl-field-error__mark">
        !
      </span>
      {children}
    </p>
  );
}

export type FieldControlProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

export type FieldProps = {
  label: string;
  error?: string;
  children: (props: FieldControlProps) => ReactNode;
  className?: string;
};

export function Field({ label, error, children, className }: FieldProps) {
  const id = useId();
  const errorId = `${id}-err`;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="tl-field__label">
        {label}
      </label>
      {children(error ? { id, "aria-invalid": true, "aria-describedby": errorId } : { id })}
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}