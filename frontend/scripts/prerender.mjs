// hand-authored static snapshot of Landing's default hero, not a
// real SSR pass — Landing is stateful (fetch, localStorage, matchMedia) and
// none of that is available at build time. This gives crawlers/curl real
// markup in <div id="app"> instead of an empty shell. It reuses the same
// card/heading classes as Landing.tsx's header so it also doubles as the
// pre-hydration loading state — React swaps in matching-looking markup
// instead of visibly snapping from plain text to the styled card. Keep the
// classes and copy here in sync with src/screens/Landing.tsx's header.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const distIndex = path.resolve(import.meta.dirname, "../dist/index.html");

const snapshot = `<div id="app"><main class="flex min-h-screen items-center justify-center bg-surface-ground px-4 py-8 sm:px-6 sm:py-12"><div class="relative mx-auto flex w-full max-w-[920px] items-center justify-center"><div class="relative z-[1] w-full max-w-[440px] rounded-2xl border border-kotare-grey bg-surface-card shadow-xl shadow-kotare-blue/10"><div class="relative rounded-t-2xl px-6 pt-10 pb-8 sm:px-9 sm:pt-12 sm:pb-10"><h1 class="mb-3 text-[32px] sm:text-[38px] font-extrabold leading-[1.05] tracking-tight text-ink">Does public transport<br>still reach you?</h1><p class="mb-6 max-w-[36ch] text-[14px] leading-relaxed text-ink-soft">Check your own address and see exactly how your trips change under this proposal.</p></div></div></div></main></div>`;

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
