import { type ComponentProps, type ReactNode, useId } from "react";
import { cx } from "./cx";
import { FieldError } from "./Field";
import { Avatar } from "./Pill";

export function SettingsLayout({ children }: { children: ReactNode }) {
  return <main className="tl-settings">{children}</main>;
}

export function SettingsIdentity({ initials, name }: { initials: string; name: string }) {
  return (
    <div className="tl-settings__identity">
      <Avatar
        initials={initials}
        size="lg"
      />
      <span className="tl-settings__name">{name}</span>
    </div>
  );
}

export type SettingsFormProps = Omit<ComponentProps<"form">, "title"> & { title?: string };

export function SettingsForm({ title, children, className, ...rest }: SettingsFormProps) {
  const titleId = useId();
  return (
    <form
      noValidate
      aria-labelledby={title ? titleId : undefined}
      className={cx("tl-settings__form", title && "tl-settings__form--section", className)}
      {...rest}>
      {title && (
        <h2
          id={titleId}
          className="tl-settings__title">
          {title}
        </h2>
      )}
      {children}
    </form>
  );
}

export function SettingsActions({ children }: { children: ReactNode }) {
  return <div className="tl-settings__actions">{children}</div>;
}

export function FactList({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <dl className="tl-facts">{children}</dl>
      {note && <p className="tl-facts__note">{note}</p>}
    </div>
  );
}

export function Fact({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="tl-fact">
      <dt className="tl-fact__label">{label}</dt>
      <dd className={cx("tl-fact__value", mono && "tl-fact__value--mono")}>{children}</dd>
    </div>
  );
}

export function FormStatus({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="tl-form-status">
      {children}
    </p>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="tl-form-error">
      <FieldError>{children}</FieldError>
    </div>
  );
}