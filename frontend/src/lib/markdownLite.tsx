import { isValidElement, type ReactNode } from "react";

// A small, safe subset of markdown for analysis descriptions: paragraphs,
// images, links and bold. Not a full parser — descriptions are our own
// config data, not arbitrary user input, so this only needs to cover what
// backend/config actually lets an author write.
const INLINE_PATTERN =
  /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function resolveImageSrc(src: string, imageBase?: string): string {
  if (!imageBase || /^(https?:)?\/\//.test(src) || src.startsWith("/")) {
    return src;
  }
  return `${imageBase}/${src}`;
}

function renderInline(
  text: string,
  keyPrefix: string,
  imageBase?: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  INLINE_PATTERN.lastIndex = 0;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, imageAlt, imageSrc, linkText, linkHref, bold] = match;
    const key = `${keyPrefix}-${count++}`;
    if (imageSrc !== undefined) {
      nodes.push(
        <img
          key={key}
          src={resolveImageSrc(imageSrc, imageBase)}
          alt={imageAlt}
          className="max-w-full rounded-md"
          data-markdown-lite-image
        />,
      );
    } else if (linkHref !== undefined) {
      nodes.push(
        <a
          key={key}
          href={linkHref}
          target="_blank"
          rel="noreferrer noopener"
          className="text-kotare-blue underline"
        >
          {linkText}
        </a>,
      );
    } else if (bold !== undefined) {
      nodes.push(<strong key={key}>{bold}</strong>);
    }
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return groupAdjacentImages(nodes, keyPrefix);
}

// Consecutive images (e.g. a before/after pair) read better side by side
// than stacked, so adjacent `<img>` nodes — ignoring whitespace-only text
// between them — get wrapped in a shared flex row.
function isMarkdownLiteImage(node: ReactNode): boolean {
  return (
    isValidElement(node) &&
    (node.props as { "data-markdown-lite-image"?: boolean })[
      "data-markdown-lite-image"
    ] === true
  );
}

function groupAdjacentImages(
  nodes: ReactNode[],
  keyPrefix: string,
): ReactNode[] {
  const result: ReactNode[] = [];
  let group: ReactNode[] = [];
  const flushGroup = () => {
    if (group.length === 0) {
      return;
    }
    result.push(
      group.length === 1 ? (
        <div key={`${keyPrefix}-img-${result.length}`} className="my-2">
          {group[0]}
        </div>
      ) : (
        <div
          key={`${keyPrefix}-img-${result.length}`}
          className="my-2 flex flex-wrap gap-2"
        >
          {group.map((img, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: group order never changes for a given description
            <div key={i} className="min-w-0 flex-1">
              {img}
            </div>
          ))}
        </div>
      ),
    );
    group = [];
  };

  for (const node of nodes) {
    if (isMarkdownLiteImage(node)) {
      group.push(node);
    } else if (typeof node === "string" && node.trim() === "") {
    } else {
      flushGroup();
      result.push(node);
    }
  }
  flushGroup();
  return result;
}

export function renderMarkdownLite(
  source: string,
  imageBase?: string,
): ReactNode {
  const paragraphs = source.trim().split(/\n\s*\n/);
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraph order never changes for a given description
        <p key={index} className="mb-2 last:mb-0">
          {renderInline(paragraph.trim(), `p${index}`, imageBase)}
        </p>
      ))}
    </>
  );
}

export function stripMarkdownLite(source: string): string {
  return source
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
