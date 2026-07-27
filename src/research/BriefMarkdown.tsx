import type { ReactNode } from "react";
import { createElement, Fragment } from "react";

/** Rend du Markdown léger (titres, listes, gras, italique, liens, hr). */
export function BriefMarkdown({ text }: { text: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let listBuf: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!listBuf.length) return;
    nodes.push(
      createElement(
        "ul",
        { key: `ul-${key++}`, className: "brief-md-list" },
        listBuf.map((item, i) =>
          createElement("li", { key: i }, renderInline(item)),
        ),
      ),
    );
    listBuf = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      nodes.push(createElement("div", { key: `sp-${key++}`, className: "brief-md-gap" }));
      continue;
    }
    if (/^---+$/.test(trimmed) || /^___+$/.test(trimmed)) {
      flushList();
      nodes.push(createElement("hr", { key: `hr-${key++}` }));
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(
        createElement("h5", { key: `h5-${key++}` }, renderInline(trimmed.slice(4))),
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushList();
      nodes.push(
        createElement("h4", { key: `h4-${key++}` }, renderInline(trimmed.slice(3))),
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushList();
      nodes.push(
        createElement("h3", { key: `h3-${key++}` }, renderInline(trimmed.slice(2))),
      );
      continue;
    }
    const bullet = /^([-*•]|\d+\.)\s+/.exec(trimmed);
    if (bullet) {
      listBuf.push(trimmed.slice(bullet[0].length));
      continue;
    }
    if (trimmed.startsWith("→ ")) {
      flushList();
      nodes.push(
        createElement(
          "p",
          { key: `arrow-${key++}`, className: "brief-md-arrow" },
          createElement("span", { "aria-hidden": true }, "→ "),
          renderInline(trimmed.slice(2)),
        ),
      );
      continue;
    }
    flushList();
    nodes.push(
      createElement("p", { key: `p-${key++}` }, renderInline(trimmed)),
    );
  }
  flushList();

  return createElement("div", { className: "brief-md" }, nodes);
}

function renderInline(text: string): ReactNode {
  // Split on **bold**, *italic*, [n] refs, and bare URLs lightly
  const parts: ReactNode[] = [];
  const re =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\d+\]|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        createElement("strong", { key: `b-${i++}` }, token.slice(2, -2)),
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        createElement("code", { key: `c-${i++}` }, token.slice(1, -1)),
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        createElement("em", { key: `i-${i++}` }, token.slice(1, -1)),
      );
    } else if (/^\[\d+\]$/.test(token)) {
      parts.push(
        createElement("sup", { key: `ref-${i++}`, className: "brief-md-ref" }, token),
      );
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        parts.push(
          createElement(
            "a",
            {
              key: `a-${i++}`,
              href: link[2],
              target: "_blank",
              rel: "noreferrer",
            },
            link[1],
          ),
        );
      } else {
        parts.push(token);
      }
    }
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return createElement(Fragment, null, ...parts);
}
