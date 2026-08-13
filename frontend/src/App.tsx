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
  return (
    <WizardStateProvider>
      <main className="flex min-h-screen items-center justify-center bg-surface-ground px-4 py-8 sm:px-6 sm:py-12">
        <Screens />
      </main>
    </WizardStateProvider>
  );
}
