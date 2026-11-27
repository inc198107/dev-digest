import React from "react";
import { Icon } from "../icons";

/**
 * REAL controlled <select>. The `<select>` itself is the visible box, so the option
 * list (styled through `.dd-select` in `styles.css`) opens aligned with it.
 * @param props.value - the selected option value
 * @param props.onChange - called with the newly selected value
 * @param props.options - plain values, or value/label pairs
 * @param props.mono - render the value and options in the monospace font
 * @returns the select box with a trailing chevron
 */
export function SelectInput({
  value,
  onChange,
  options,
  mono = true,
}: {
  value: string;
  onChange?: (v: string) => void;
  options: (string | { value: string; label: string })[];
  mono?: boolean;
}) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <select
        className={mono ? "dd-select mono" : "dd-select"}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 36px 10px 12px",
          borderRadius: 7,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          fontSize: 14,
          color: "var(--text-primary)",
          outline: "none",
          cursor: "pointer",
        }}
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      <Icon.ChevronsUpDown
        size={14}
        style={{ position: "absolute", right: 12, color: "var(--text-muted)", pointerEvents: "none" }}
      />
    </div>
  );
}
