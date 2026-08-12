import { cn } from "./lib/cn";
import { useScreen } from "./router";
import { Landing } from "./screens/Landing";
import { Location } from "./screens/Location";
import { Proposal } from "./screens/Proposal";
import { Results } from "./screens/Results";
import { WizardStateProvider } from "./state/WizardStateContext";

function Screens() {
  const screen = useScreen();
  switch (screen) {
    case "landing":
      return <Landing />;
    case "proposal":
      return <Proposal />;
    case "location":
      return <Location />;
    case "results":
      return <Results />;
  }
}

export function App() {
  const screen = useScreen();
  return (
    <WizardStateProvider>
      <main
        className={cn(
          "min-h-screen bg-surface-ground px-4 py-8 sm:px-6 sm:py-12",
          screen === "landing" && "flex items-center justify-center",
        )}
      >
        <Screens />
      </main>
    </WizardStateProvider>
  );
}
