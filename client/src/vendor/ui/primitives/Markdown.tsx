import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer (replaces prototype mdLite). Inline + GFM.
 * @param props.children The Markdown source.
 * @param props.doc Document mode: styles headings, lists, quotes and code blocks (rules under
 *   `.dd-md-doc` in styles.css) for whole documents such as a skill body; off, the output stays
 *   compact for short texts like a finding rationale. Images are never loaded in document mode:
 *   documents can come from untrusted imports, and an <img> would make the browser request an
 *   attacker-chosen URL as soon as the text is shown; the image reference is printed instead.
 * @returns The rendered Markdown, or null when there is no source.
 */
export function Markdown({ children, doc }: { children?: string | null; doc?: boolean }) {
  if (!children) return null;
  return (
    <div className={doc ? "dd-md dd-md-doc" : "dd-md"} style={{ fontSize: "inherit", lineHeight: 1.55 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...(doc
            ? {
                img: ({ alt, src }) => (
                  <span className="mono" style={{ fontSize: "0.92em", color: "var(--text-muted)" }}>
                    [image: {alt || "untitled"}] {typeof src === "string" ? src : ""}
                  </span>
                ),
              }
            : {}),
          p: ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>,
          strong: ({ children }) => (
            <strong style={{ fontWeight: 650, color: "var(--text-primary)" }}>{children}</strong>
          ),
          code: ({ children }) => (
            <code
              className="mono"
              style={{
                fontSize: "0.92em",
                padding: "1px 6px",
                borderRadius: 4,
                background: "var(--bg-hover)",
                color: "var(--accent-text)",
              }}
            >
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
