import { type ComponentProps, type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { FocusScope } from "react-aria";
import { cx } from "./cx";

export type DialogBackdropProps = { onClose?: () => void; children: ReactNode; style?: CSSProperties };

export function DialogBackdrop({ onClose, children, style }: DialogBackdropProps) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = backdrop.current;
    if (!onClose || !element) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.target === element) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    element.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);
  return (
    <div
      ref={backdrop}
      className="tl-backdrop"
      style={style}>
      <FocusScope
        contain
        restoreFocus
        autoFocus>
        {children}
      </FocusScope>
    </div>
  );
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "dialog" | "alertdialog";
};

export function Dialog({ open, onClose, title, children, actions, role = "dialog" }: DialogProps) {
  if (!open) return null;
  const semantics = { role, "aria-modal": true, "aria-label": title };
  return (
    <DialogBackdrop onClose={onClose}>
      <div
        {...semantics}
        className="tl-dialog">
        <div className="tl-dialog__title">{title}</div>
        {children && <div className="tl-dialog__body">{children}</div>}
        {actions && <div className="tl-dialog__actions">{actions}</div>}
      </div>
    </DialogBackdrop>
  );
}

export type AppDialogProps = {
  open: boolean;
  onClose: () => void;
  head?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  label: string;
};

export function AppDialog({ open, onClose, head, children, foot, label }: AppDialogProps) {
  if (!open) return null;
  return (
    <DialogBackdrop onClose={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="tl-appdialog">
        {head && <div className="tl-appdialog__head">{head}</div>}
        <div className="tl-appdialog__main">{children}</div>
        {foot && <div className="tl-appdialog__foot">{foot}</div>}
      </div>
    </DialogBackdrop>
  );
}

export function TitleInput({ className, ...rest }: ComponentProps<"input">) {
  return (
    <input
      className={cx("tl-title-input", className)}
      {...rest}
    />
  );
}