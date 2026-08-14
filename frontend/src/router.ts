import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

export type Screen =
  | "landing"
  | "proposal"
  | "location"
  | "results"
  | "not-found";

const PATH_TO_SCREEN: Record<string, Screen> = {
  "/": "landing",
  "/proposal": "proposal",
  "/location": "location",
  "/results": "results",
};

const SCREEN_TO_PATH: Record<Screen, string> = {
  landing: "/",
  proposal: "/proposal",
  location: "/location",
  results: "/results",
  "not-found": "/404",
};

export function currentScreen(): Screen {
  return PATH_TO_SCREEN[window.location.pathname] ?? "not-found";
}

function goTo(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigate(screen: Screen, search = ""): void {
  const path = SCREEN_TO_PATH[screen] + search;
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => void;
  };
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  // A same-screen navigation (e.g. the Proposal city filter) only changes
  // search params in place — animating a full-page view transition for that
  // cross-fades the whole snapshot and reads as a jump, not a smooth resize.
  const sameScreen = screen === currentScreen();
  if (sameScreen || !doc.startViewTransition || reduceMotion) {
    goTo(path);
    return;
  }
  doc.startViewTransition(() => flushSync(() => goTo(path)));
}

export function replaceScreen(screen: Screen, search = ""): void {
  const path = SCREEN_TO_PATH[screen] + search;
  window.history.replaceState(null, "", path);
}

export function onNavigate(handler: (screen: Screen) => void): () => void {
  const listener = () => handler(currentScreen());
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

let cachedSearchString = "";
let cachedSearchParams = new URLSearchParams(cachedSearchString);

export function currentSearch(): URLSearchParams {
  const search = window.location.search;
  if (search !== cachedSearchString) {
    cachedSearchString = search;
    cachedSearchParams = new URLSearchParams(search);
  }
  return cachedSearchParams;
}

function subscribe(callback: () => void): () => void {
  return onNavigate(callback);
}

export function useScreen(): Screen {
  return useSyncExternalStore(subscribe, currentScreen);
}

export function useSearchParams(): URLSearchParams {
  return useSyncExternalStore(subscribe, currentSearch);
}
