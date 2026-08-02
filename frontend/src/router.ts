export type Screen = "landing" | "picker" | "location" | "scenario" | "results";

const PATH_TO_SCREEN: Record<string, Screen> = {
  "/": "landing",
  "/picker": "picker",
  "/location": "location",
  "/scenario": "scenario",
  "/results": "results",
};

const SCREEN_TO_PATH: Record<Screen, string> = {
  landing: "/",
  picker: "/picker",
  location: "/location",
  scenario: "/scenario",
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

export function currentSearch(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
