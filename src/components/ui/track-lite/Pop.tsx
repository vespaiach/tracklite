import { ChevronDown, ChevronRight, ChevronUp, Plus } from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  type Ref,
  use,
  useState,
} from "react";
import {
  Button as AriaButton,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Autocomplete,
  Input,
  type Key,
  ListBox,
  ListBoxItem,
  MenuTrigger,
  Popover,
  SearchField,
  Select,
  type Selection,
  Separator,
  SubmenuTrigger,
  useFilter,
} from "react-aria-components";
import { cx } from "./cx";
import { Avatar } from "./Pill";

export function Pop({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      role="listbox"
      className={cx("tl-pop", className)}
      {...rest}
    />
  );
}

export function PopSearch({ icon, ...rest }: ComponentProps<"input"> & { icon?: ReactNode }) {
  return (
    <div className="tl-pop__search">
      {icon}
      <input {...rest} />
    </div>
  );
}

export function PopLabel({ children }: { children: ReactNode }) {
  return <div className="tl-pop__label">{children}</div>;
}

export function PopSep() {
  return <div className="tl-pop__sep" />;
}

export type PopItemProps = ComponentProps<"button"> & {
  selected?: boolean;
  danger?: boolean;
  end?: ReactNode;
};

export function PopItem({
  selected,
  disabled,
  danger,
  end,
  className,
  children,
  onClick,
  ...rest
}: PopItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected || undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cx("tl-pop__item", danger && "tl-pop__item--danger", className)}
      {...rest}>
      {children}
      {end && <span className="tl-pop__end">{end}</span>}
      {selected && !end && <span className="tl-pop__check">✓</span>}
    </button>
  );
}

export function PopFoot({ children }: { children: ReactNode }) {
  return <div className="tl-pop__foot">{children}</div>;
}

export type MenuProps = {
  label: string;
  icon?: ReactNode;
  text?: ReactNode;
  variant?: "quiet" | "secondary" | "rail";
  selectedKey?: Key;
  onAction: (key: Key) => void;
  children: ReactNode;
  id?: string;
  "aria-describedby"?: string;
  ref?: Ref<HTMLButtonElement>;
};

const MenuActionContext = createContext<(key: Key) => void>(() => {});

export function Menu({
  label,
  icon,
  text,
  variant = "quiet",
  selectedKey,
  onAction,
  children,
  id,
  "aria-describedby": describedBy,
  ref,
}: MenuProps) {
  const rail = variant === "rail";
  return (
    <MenuActionContext value={onAction}>
      <MenuTrigger>
        <AriaButton
          ref={ref}
          id={id}
          aria-label={label}
          aria-describedby={describedBy}
          className={
            rail
              ? "tl-rail-item"
              : cx("tl-btn tl-btn--sm", `tl-btn--${variant}`, text === undefined && "tl-btn--icon")
          }>
          {text ?? icon}
          {rail && (
            <span
              aria-hidden="true"
              className="tl-rail-item__end tl-rail-item__caret">
              <ChevronUp size={12} />
            </span>
          )}
        </AriaButton>
        <Popover
          placement={rail ? "top" : "bottom end"}
          className={rail ? "tl-rail-menu" : undefined}>
          <AriaMenu
            aria-label={label}
            className="tl-pop"
            {...(selectedKey === undefined
              ? { onAction }
              : {
                  selectionMode: "single",
                  disallowEmptySelection: true,
                  selectedKeys: [selectedKey],
                  onSelectionChange: (keys: Selection) => {
                    if (keys !== "all") for (const key of keys) onAction(key);
                  },
                })}>
            {children}
          </AriaMenu>
        </Popover>
      </MenuTrigger>
    </MenuActionContext>
  );
}

export type MenuItemProps = {
  id: string;
  danger?: boolean;
  icon?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  children: string;
};

export function MenuItem({ id, danger, icon, checked, disabled, children }: MenuItemProps) {
  return (
    <AriaMenuItem
      id={id}
      textValue={children}
      isDisabled={disabled}
      className={cx("tl-pop__item", danger && "tl-pop__item--danger")}>
      {({ isSelected }) => (
        <>
          {icon && (
            <span
              aria-hidden="true"
              className="tl-pop__icon">
              {icon}
            </span>
          )}
          {children}
          {(isSelected || checked) && <span className="tl-pop__check">✓</span>}
        </>
      )}
    </AriaMenuItem>
  );
}

const phoneWidth = 480;

export function MenuSubmenu({ label, children }: { label: string; children: ReactNode }) {
  const onAction = use(MenuActionContext);
  return (
    <SubmenuTrigger>
      <AriaMenuItem
        textValue={label}
        className="tl-pop__item">
        {label}
        <span
          aria-hidden="true"
          className="tl-pop__caret">
          <ChevronRight size={14} />
        </span>
      </AriaMenuItem>
      <Popover placement={window.innerWidth < phoneWidth ? "bottom end" : "end top"}>
        <AriaMenu
          aria-label={label}
          className="tl-pop"
          onAction={(key) => onAction(key)}>
          {children}
        </AriaMenu>
      </Popover>
    </SubmenuTrigger>
  );
}

export function MenuSep() {
  return <Separator className="tl-pop__sep" />;
}

export type PickerSearch = {
  label: string;
  placeholder?: string;
  filter?: (textValue: string, input: string) => boolean;
};

export type PickerProps = {
  label: string;
  selectedKey: Key;
  value: ReactNode;
  empty?: boolean;
  onChange: (key: Key) => void;
  search?: PickerSearch;
  emptyNote?: ReactNode;
  children: ReactNode;
  "aria-describedby"?: string;
};

export function Picker({
  label,
  selectedKey,
  value,
  empty,
  onChange,
  search,
  emptyNote,
  children,
  "aria-describedby": describedBy,
}: PickerProps) {
  const { contains } = useFilter({ sensitivity: "base" });
  const list = <ListBox aria-label={label}>{children}</ListBox>;
  return (
    <Select
      aria-label={label}
      aria-describedby={describedBy}
      value={selectedKey}
      allowsEmptyCollection={emptyNote !== undefined}
      onChange={(key) => {
        if (key !== null) onChange(key);
      }}>
      <AriaButton className={cx("tl-pick", empty && "tl-pick--empty")}>
        {value}
        <PickCaret />
      </AriaButton>
      <Popover
        placement="bottom start"
        className="tl-pop">
        {search ? (
          <Autocomplete filter={search.filter ?? contains}>
            <SearchField
              aria-label={search.label}
              autoFocus
              className="tl-pop__search">
              <Input placeholder={search.placeholder} />
            </SearchField>
            {list}
          </Autocomplete>
        ) : (
          list
        )}
        <PopNote>{emptyNote}</PopNote>
      </Popover>
    </Select>
  );
}

export function PickerItem({ id, textValue, children }: { id: Key; textValue: string; children: ReactNode }) {
  return (
    <ListBoxItem
      id={id}
      textValue={textValue}
      className="tl-pop__item">
      {({ isSelected }) => (
        <>
          {children}
          {isSelected && (
            <span
              aria-hidden="true"
              className="tl-pop__check">
              ✓
            </span>
          )}
        </>
      )}
    </ListBoxItem>
  );
}

function PickCaret() {
  return (
    <span
      aria-hidden="true"
      className="tl-pick__caret">
      <ChevronDown size={12} />
    </span>
  );
}

function PopNote({ children }: { children: ReactNode }) {
  return children && <p className="tl-pop__note">{children}</p>;
}

export function PickValue({ children }: { children: ReactNode }) {
  return <div className="tl-pick tl-pick--static">{children}</div>;
}

export type MultiPickerProps = {
  label: string;
  selectedKeys: Key[];
  value: ReactNode;
  empty?: boolean;
  onToggle: (key: Key) => void;
  search: PickerSearch;
  createText?: (input: string) => string | undefined;
  onCreate?: (input: string) => void;
  emptyNote?: ReactNode;
  variant?: "pick" | "secondary";
  children: ReactNode;
  "aria-describedby"?: string;
};

const createKey = "_create";

export function MultiPicker({
  label,
  selectedKeys,
  value,
  empty,
  onToggle,
  search,
  createText,
  onCreate,
  emptyNote,
  variant = "pick",
  children,
  "aria-describedby": describedBy,
}: MultiPickerProps) {
  const { contains } = useFilter({ sensitivity: "base" });
  const [input, setInput] = useState("");
  const create = createText?.(input);
  return (
    <Select
      aria-label={label}
      aria-describedby={describedBy}
      selectionMode="multiple"
      value={selectedKeys}
      allowsEmptyCollection={emptyNote !== undefined}
      onOpenChange={(open) => {
        if (!open) setInput("");
      }}
      onChange={(keys) => {
        const added = keys.find((key) => !selectedKeys.includes(key));
        if (added === createKey) onCreate?.(input);
        else {
          const toggled = added ?? selectedKeys.find((key) => !keys.includes(key));
          if (toggled !== undefined) onToggle(toggled);
        }
      }}>
      {variant === "secondary" ? (
        <AriaButton className="tl-btn tl-btn--secondary tl-btn--sm">{value}</AriaButton>
      ) : (
        <AriaButton className={cx("tl-pick tl-pick--multi", empty && "tl-pick--empty")}>
          <span className="tl-pick__values">{value}</span>
          <PickCaret />
        </AriaButton>
      )}
      <Popover
        placement="bottom start"
        className="tl-pop">
        <Autocomplete
          filter={(text, typed) => text === typed || (search.filter ?? contains)(text, typed)}
          inputValue={input}
          onInputChange={setInput}>
          <SearchField
            aria-label={search.label}
            autoFocus
            className="tl-pop__search">
            <Input placeholder={search.placeholder} />
          </SearchField>
          <ListBox aria-label={label}>
            {children}
            {create && (
              <ListBoxItem
                id={createKey}
                textValue={input}
                aria-label={create}
                className="tl-pop__item">
                <Plus
                  aria-hidden="true"
                  size={12}
                />
                {create}
              </ListBoxItem>
            )}
          </ListBox>
        </Autocomplete>
        <PopNote>{emptyNote}</PopNote>
      </Popover>
    </Select>
  );
}

export type MentionOption = { username: string; fullName: string; initials: string };

export type MentionListProps = {
  id: string;
  members: MentionOption[];
  active: number;
  empty: string;
  onChoose: (username: string) => void;
  style?: CSSProperties;
};

export function MentionList({ id, members, active, empty, onChoose, style }: MentionListProps) {
  return (
    <Pop
      id={id}
      aria-label="Mention a member"
      className="tl-mention-list"
      style={style}>
      {members.map((member, index) => (
        <PopItem
          key={member.username}
          id={`${id}-${member.username}`}
          data-key={member.username}
          tabIndex={-1}
          aria-selected={index === active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChoose(member.username)}>
          <Avatar
            size="sm"
            tone="neutral"
            initials={member.initials}
          />
          {member.fullName}
          <span className="tl-mention-list__user">{member.username}</span>
        </PopItem>
      ))}
      {members.length === 0 && (
        <div
          role="status"
          className="tl-pop__item tl-pop__item--note">
          {empty}
        </div>
      )}
    </Pop>
  );
}