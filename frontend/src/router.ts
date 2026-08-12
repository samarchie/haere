import { useSyncExternalStore } from "react";

export type Screen = "landing" | "proposal" | "location" | "results";

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
};

export function currentScreen(): Screen {
  return PATH_TO_SCREEN[window.location.pathname] ?? "landing";
}

export function navigate(screen: Screen, search = ""): void {
  const path = SCREEN_TO_PATH[screen] + search;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
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
