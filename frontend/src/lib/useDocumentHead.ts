import { useEffect } from "react";

interface DocumentHead {
  title: string;
  description: string;
  path: string;
  // Wizard steps only render meaningful content once query-string state is
  // present, so they're not useful as standalone indexed pages.
  noindex?: boolean;
}

const SITE_NAME = "haere";
const SITE_URL = "https://haere.samarchie.dev";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// SPA has no server-side rendering, so per-route <title>/meta/canonical are
// applied client-side on mount — this covers browser tabs, social share
// unfurls that execute JS, and search engines that render before indexing,
// but not a raw `curl`/view-source of a non-landing route.
export function useDocumentHead({
  title,
  description,
  path,
  noindex = false,
}: DocumentHead) {
  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} • ${SITE_NAME}`;
    const url = `${SITE_URL}${path}`;
    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setCanonical(url);
  }, [title, description, path, noindex]);
}
