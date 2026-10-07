import { CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Button as AriaButton, type Key, ListBox, Popover, Select } from "react-aria-components";
import { cx } from "./cx";
import { Kbd } from "./Pill";

export function Filters({ children, end, label }: { children: ReactNode; end?: ReactNode; label: string }) {
  return (
    <search
      aria-label={label}
      className="tl-filters">
      {children}
      {end && <div className="tl-filters__end">{end}</div>}
    </search>
  );
}

export type FilterRuleProps = {
  field: string;
  op: string;
  value: ReactNode;
  onValue?: () => void;
  onRemove?: () => void;
};

export function FilterRule({ field, op, value, onValue, onRemove }: FilterRuleProps) {
  return (
    <span className="tl-filter-rule">
      <span className="tl-filter-rule__seg tl-filter-rule__field">{field}</span>
      <span className="tl-filter-rule__seg tl-filter-rule__op">{op}</span>
      <button
        type="button"
        onClick={onValue}
        className="tl-filter-rule__seg tl-filter-rule__value">
        {value}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${field} filter`}
          onClick={onRemove}
          className="tl-filter-rule__seg tl-filter-rule__remove">
          ×
        </button>
      )}
    </span>
  );
}

export function FilterAdd({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tl-filter-add">
      {children}
    </button>
  );
}

export type FilterPickerProps = {
  field: string;
  values: string[];
  selectedKeys: Key[];
  onToggle: (key: Key) => void;
  onClear: () => void;
  children: ReactNode;
};

export function FilterPicker({
  field,
  values,
  selectedKeys,
  onToggle,
  onClear,
  children,
}: FilterPickerProps) {
  const rule = values.length > 0;
  return (
    <span className={cx("tl-filter-slot", rule && "tl-filter-rule")}>
      {rule && <span className="tl-filter-rule__seg tl-filter-rule__field">{field}</span>}
      {rule && (
        <span className="tl-filter-rule__seg tl-filter-rule__op">
          {values.length > 1 ? "is any of" : "is"}
        </span>
      )}
      <Select
        aria-label={field}
        selectionMode="multiple"
        value={selectedKeys}
        onChange={(keys) => {
          const toggled =
            keys.find((key) => !selectedKeys.includes(key)) ??
            selectedKeys.find((key) => !keys.includes(key));
          if (toggled !== undefined) onToggle(toggled);
        }}>
        <AriaButton className={rule ? "tl-filter-rule__seg tl-filter-rule__value" : "tl-filter-add"}>
          {rule ? (
            values.join(", ")
          ) : (
            <>
              {field}
              <CaretDown
                aria-hidden="true"
                size={11}
              />
            </>
          )}
        </AriaButton>
        <Popover
          placement="bottom start"
          className="tl-pop">
          <ListBox aria-label={field}>{children}</ListBox>
        </Popover>
      </Select>
      {rule && (
        <button
          type="button"
          aria-label={`Clear ${field.toLowerCase()} filter`}
          onClick={onClear}
          className="tl-filter-rule__seg tl-filter-rule__remove">
          ×
        </button>
      )}
    </span>
  );
}

export type Command = {
  id: string;
  label: string;
  path?: string;
  icon?: ReactNode;
  keys?: string[];
  run: () => void;
};

export type CommandMenuProps = {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  scope?: ReactNode;
  placeholder?: string;
  inline?: boolean;
};

export function CommandMenu({
  open,
  onClose,
  commands,
  scope,
  placeholder = "Type a command or search…",
  inline,
}: CommandMenuProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const matches = useMemo(
    () => commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    if (!inline) input.current?.focus();
  }, [open, inline]);

  useEffect(() => {
    const element = backdrop.current;
    if (!open || !element) return;
    const onMouseDown = (event: MouseEvent) => {
      if (event.target === element) onClose();
    };
    element.addEventListener("mousedown", onMouseDown);
    return () => element.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose]);

  if (!open) return null;

  const choose = (command: Command) => {
    command.run();
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, matches.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
    }
    if (event.key === "Enter" && matches[selected]) choose(matches[selected]);
    if (event.key === "Escape") onClose();
  };

  const panel = (
    <div
      role="dialog"
      aria-label="Command menu"
      className="tl-cmd"
      onKeyDown={onKeyDown}>
      <div className="tl-cmd__head">
        {scope}
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          placeholder={placeholder}
          className="tl-cmd__input"
        />
      </div>
      <div
        role="listbox"
        className="tl-cmd__list">
        {matches.length === 0 && <div className="tl-cmd__empty">No results for “{query}”</div>}
        {matches.map((command, index) => (
          <button
            key={command.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            onMouseEnter={() => setSelected(index)}
            onClick={() => choose(command)}
            className="tl-cmd__item">
            {command.icon}
            {command.label}
            {command.path && <span className="tl-cmd__path">{command.path}</span>}
            {command.keys && (
              <span className="tl-cmd__keys tl-kbds">
                {command.keys.map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="tl-cmd__foot">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </div>
  );

  if (inline) return panel;
  return (
    <div
      ref={backdrop}
      className="tl-cmd-backdrop">
      {panel}
    </div>
  );
}

export type ToastItem = {
  id: number;
  message: ReactNode;
  tone?: "default" | "warn" | "err";
  action?: { label: string; run: () => void };
};

export function Toasts({
  items,
  onDismiss,
  inline,
}: {
  items: ToastItem[];
  onDismiss?: (id: number) => void;
  inline?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className="tl-toasts"
      style={inline ? { position: "static" } : undefined}>
      {items.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="tl-toast">
          <span
            className={cx(
              "tl-toast__stripe",
              toast.tone === "warn" && "tl-toast__stripe--warn",
              toast.tone === "err" && "tl-toast__stripe--err",
            )}
          />
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.run}
              className="tl-toast__action">
              {toast.action.label}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => onDismiss(toast.id)}
              className="tl-toast__dismiss">
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}