// hand-authored static snapshot of Landing's default hero, not a
// real SSR pass — Landing is stateful (fetch, localStorage, matchMedia) and
// none of that is available at build time. This just gives crawlers/curl
// real markup in <div id="app"> instead of an empty shell; React overwrites
// it via createRoot on load, same as before. Keep this copy in sync with
// the h1/p in src/screens/Landing.tsx's default (non-resumable) state.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const distIndex = path.resolve(import.meta.dirname, "../dist/index.html");

const snapshot = `<div id="app"><main><h1>Does public transport still reach you?</h1><p>Check your own address and see exactly how your trips change under this proposal.</p></main></div>`;

const html = readFileSync(distIndex, "utf8");
const updated = html.replace(
  /<div id="app">[\s\S]*?(?=<div id="noscript-fallback">)/,
  `${snapshot}\n    `,
);

if (updated === html) {
  throw new Error(
    'prerender: <div id="app">...</div> not found in dist/index.html',
  );
}

writeFileSync(distIndex, updated);
