import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { MentionList } from "../components/ui/track-lite";
import { useMembersQuery } from "./api";

const typedMention = /(?<![A-Za-z0-9._%+@-])@([a-z0-9-]{0,20})$/i;

const mirroredStyles = [
  "boxSizing",
  "width",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderLeftWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "tabSize",
] as const;

function caretPosition(textarea: HTMLTextAreaElement, index: number): CSSProperties {
  const mirror = document.createElement("div");
  const computed = getComputedStyle(textarea);
  for (const property of mirroredStyles) mirror.style[property] = computed[property];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = textarea.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.5;
  const position = {
    left: marker.offsetLeft,
    top: marker.offsetTop - textarea.scrollTop + lineHeight,
  };
  mirror.remove();
  return position;
}

export function useMentions({ value, onChange }: { value: string; onChange: (value: string) => void }): {
  textarea: {
    ref: RefObject<HTMLTextAreaElement | null>;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: () => void;
    "aria-autocomplete": "list";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    "aria-activedescendant": string | undefined;
  };
  onChange: (value: string) => void;
  list: ReactNode;
} {
  const { data: members = [] } = useMembersQuery();
  const listId = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number>();
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<CSSProperties>();
  const pendingCaret = useRef<number>(undefined);

  const typed = caret === undefined ? null : typedMention.exec(value.slice(0, caret));
  const open = typed !== null && !dismissed;
  const query = typed?.[1].toLowerCase() ?? "";
  const matches = open
    ? members.filter(
        (member) =>
          !member.deactivated &&
          (member.username.includes(query) || member.fullName.toLowerCase().includes(query)),
      )
    : [];
  const highlighted = Math.min(active, Math.max(matches.length - 1, 0));

  const mentionStart = open ? typed.index : undefined;

  useLayoutEffect(() => {
    if (pendingCaret.current === undefined) return;
    ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = undefined;
  });

  useLayoutEffect(() => {
    if (mentionStart === undefined || !ref.current) return;
    setPosition(caretPosition(ref.current, mentionStart));
  }, [mentionStart]);

  function trackCaret() {
    setCaret(ref.current?.selectionStart ?? undefined);
  }

  function change(next: string) {
    onChange(next);
    setDismissed(false);
    setActive(0);
    setCaret(ref.current?.selectionStart ?? next.length);
  }

  function choose(username: string) {
    if (!typed || caret === undefined) return;
    const inserted = `@${username} `;
    const next = value.slice(0, typed.index) + inserted + value.slice(caret);
    pendingCaret.current = typed.index + inserted.length;
    setCaret(pendingCaret.current);
    onChange(next);
    ref.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissed(true);
    } else if (event.key === "ArrowDown" && matches.length > 0) {
      event.preventDefault();
      setActive((highlighted + 1) % matches.length);
    } else if (event.key === "ArrowUp" && matches.length > 0) {
      event.preventDefault();
      setActive((highlighted - 1 + matches.length) % matches.length);
    } else if ((event.key === "Enter" || event.key === "Tab") && matches.length > 0) {
      event.preventDefault();
      choose(matches[highlighted].username);
    }
  }

  return {
    textarea: {
      ref,
      onKeyDown,
      onSelect: trackCaret,
      "aria-autocomplete": "list",
      "aria-expanded": open,
      "aria-controls": open ? listId : undefined,
      "aria-activedescendant":
        open && matches.length > 0 ? `${listId}-${matches[highlighted].username}` : undefined,
    },
    onChange: change,
    list: open && (
      <MentionList
        id={listId}
        members={matches}
        active={highlighted}
        empty={`No results for “@${typed?.[1]}”`}
        onChoose={choose}
        style={position}
      />
    ),
  };
}