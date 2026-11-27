import React from "react";
import { Icon } from "../icons";

type SelectOption = string | { value: string; label: string };
const optValue = (o: SelectOption) => (typeof o === "string" ? o : o.value);
const optLabel = (o: SelectOption) => (typeof o === "string" ? o : o.label);

/** Gap between the trigger and the list (px). */
const GAP = 6;
/** Height of the filter row plus the list padding and borders (px). */
const CHROME_HEIGHT = 56;

/**
 * Where the open list sits, in viewport coordinates. Both `top` and `bottom` are
 * always set: dropping one from the inline style would expose the UA
 * `[popover] { inset: 0 }` rule and pin the list to the viewport edge.
 */
type Placement = { left: number; width: number; top: number | "auto"; bottom: number | "auto" };

/**
 * Place the list under the trigger, or above it when the space below is short.
 * @param trigger - the trigger's viewport rect
 * @param listHeight - the tallest the list can get (px)
 * @returns fixed-position coordinates for the list
 */
function placeList(trigger: DOMRect, listHeight: number): Placement {
  const below = window.innerHeight - trigger.bottom;
  const flip = below < listHeight + GAP && trigger.top > below;
  const x = { left: trigger.left, width: trigger.width };
  return flip
    ? { ...x, top: "auto", bottom: window.innerHeight - trigger.top + GAP }
    : { ...x, top: trigger.bottom + GAP, bottom: "auto" };
}

/**
 * Searchable single-select — same options API as SelectInput, but with a filter
 * box + keyboard nav, for long lists (e.g. the 300+ OpenRouter models). Filters
 * by value and label; Enter selects, ↑/↓ move, Esc closes. The open list is a
 * manual popover in the top layer, fixed to the trigger, so a scrolling container
 * such as the Modal body does not clip it.
 * The trigger is a button: Tab reaches it, Enter/Space/↓/↑ open the list, and
 * choosing, Esc or Tab closes it and returns focus to the trigger.
 * @param props.ariaLabel - the field's label; the trigger is announced as
 *   "<label>: <selected value>"
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search…",
  mono = true,
  maxHeight = 280,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  mono?: boolean;
  maxHeight?: number;
  ariaLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const [place, setPlace] = React.useState<Placement | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Show the list in the top layer and keep it on the trigger while the page or
  // a scrolling ancestor moves. jsdom has no popover API: the list stays inline.
  React.useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const update = () => {
      const trigger = triggerRef.current;
      if (trigger) setPlace(placeList(trigger.getBoundingClientRect(), maxHeight + CHROME_HEIGHT));
    };
    update();
    const shown = typeof list?.showPopover === "function";
    if (shown) list.showPopover();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      // A list already unmounted (closing) left the top layer with its node.
      if (shown && list.isConnected) list.hidePopover();
    };
  }, [open, maxHeight]);

  React.useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  React.useEffect(() => {
    if (open) {
      setQuery("");
      setHi(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => optValue(o).toLowerCase().includes(q) || optLabel(o).toLowerCase().includes(q),
      )
    : options;

  const current = options.find((o) => optValue(o) === value);
  const currentLabel = current ? optLabel(current) : value || placeholder;
  /** The selected value stays in the accessible name: aria-label replaces the button's text. */
  const valueText = current ? optLabel(current) : value;
  const triggerName = ariaLabel && valueText ? `${ariaLabel}: ${valueText}` : ariaLabel;

  /** Close the list and give focus back to the trigger (keyboard users stay in place). */
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (o: SelectOption) => {
    onChange?.(optValue(o));
    close();
  };
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[hi];
      if (o) pick(o);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={triggerName}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span
          className={mono ? "mono" : undefined}
          style={{
            flex: 1,
            fontSize: 14,
            color: current ? "var(--text-primary)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {currentLabel}
        </span>
        <Icon.ChevronsUpDown size={14} style={{ color: "var(--text-muted)" }} />
      </button>
      {open && (
        <div
          ref={listRef}
          popover="manual"
          style={{
            position: "fixed",
            inset: "auto",
            margin: 0,
            padding: 0,
            ...place,
            color: "inherit",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            boxShadow: "var(--shadow-modal)",
            zIndex: 40,
            overflow: "hidden",
            animation: "ddpop .12s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Icon.Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHi(0);
              }}
              onKeyDown={onKey}
              placeholder={placeholder}
              className={mono ? "mono" : undefined}
              style={{
                flex: 1,
                fontSize: 14,
                color: "var(--text-primary)",
                background: "transparent",
                border: "none",
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight, overflowY: "auto", padding: 6 }}>
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 13, color: "var(--text-muted)" }}>
                No matches
              </div>
            )}
            {filtered.map((o, i) => {
              const v = optValue(o);
              const sel = v === value;
              const hot = i === hi;
              return (
                <button
                  key={v}
                  type="button"
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(o)}
                  className={mono ? "mono" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: hot ? "var(--bg-hover)" : "transparent",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <Icon.Check
                    size={13}
                    style={{ color: sel ? "var(--text-primary)" : "transparent", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {optLabel(o)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
