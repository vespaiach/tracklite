import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "./cx";

export type InputProps = ComponentProps<"input"> & { compact?: boolean; icon?: ReactNode };

export function Input({ className, compact, icon, ...rest }: InputProps) {
  const input = (
    <input
      className={cx("tl-input", compact && "tl-input--compact", icon && "tl-input--icon", !icon && className)}
      {...rest}
    />
  );
  if (!icon) return input;
  return (
    <span className={cx("tl-input-wrap", className)}>
      <span
        aria-hidden="true"
        className="tl-input-wrap__icon">
        {icon}
      </span>
      {input}
    </span>
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
  help?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
  className?: string;
};

export function Field({ label, error, help, children, className }: FieldProps) {
  const id = useId();
  const errorId = `${id}-err`;
  const helpId = `${id}-help`;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="tl-field__label">
        {label}
      </label>
      {children(
        error
          ? { id, "aria-invalid": true, "aria-describedby": errorId }
          : help
            ? { id, "aria-describedby": helpId }
            : { id },
      )}
      {error ? (
        <FieldError id={errorId}>{error}</FieldError>
      ) : (
        help && (
          <p
            id={helpId}
            className="tl-field__help">
            {help}
          </p>
        )
      )}
    </div>
  );
}