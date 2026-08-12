import { MapPin } from "lucide-react";
import { Button } from "../components/ui/button";
import { type Screen, navigate } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import type { WizardState } from "../state/wizardState";

export function hasResumableProgress(state: WizardState): boolean {
  return (
    state.analysisId !== null ||
    state.origin !== null ||
    state.destinations.length > 0
  );
}

export function resumeScreen(
  state: WizardState,
): "proposal" | "location" | "results" {
  if (state.analysisId === null) {
    return "proposal";
  }
  if (state.origin === null || state.destinations.length === 0) {
    return "location";
  }
  return "results";
}

export function Landing() {
  const { wizard, resetWizard } = useWizardState();
  const resumable = hasResumableProgress(wizard);

  const goTo = (screen: Screen) => navigate(screen);

  return (
    <div className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-kotare-grey bg-white shadow-xl shadow-kotare-blue/10">
      <div
        className="relative px-6 pt-10 pb-8 sm:px-9 sm:pt-12 sm:pb-10"
        style={{
          background:
            "radial-gradient(140% 100% at 10% -25%, rgba(40,125,171,.32), transparent 65%), #ffffff",
        }}
      >
        <h1 className="mb-3 text-[32px] sm:text-[38px] font-extrabold leading-[1.05] tracking-tight text-ink">
          Does public transport
          <br />
          still reach you?
        </h1>
        <p className="mb-6 max-w-[36ch] text-[14px] leading-relaxed text-ink-soft">
          Check your own address and see exactly how your trips change under
          this proposal.
        </p>

        {resumable ? (
          <div className="mb-3 rounded-lg border border-kotare-blue/40 bg-kotare-blue/[0.05] p-4">
            <div className="mb-1.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-kotare-blue" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-kotare-navy">
                Continue where you left off
              </span>
            </div>
            <Button
              className="mt-2 w-full"
              onClick={() => goTo(resumeScreen(wizard))}
            >
              Resume
            </Button>
            <button
              type="button"
              className="sd-focus mt-3 text-[12px] font-medium text-ink-soft hover:text-ink"
              onClick={resetWizard}
            >
              Start over
            </button>
          </div>
        ) : (
          <Button onClick={() => goTo("proposal")}>Check your address</Button>
        )}

        <button
          type="button"
          className="sd-focus mt-4 block text-[12.5px] font-semibold text-kotare-blue hover:text-kotare-navy"
          onClick={() => goTo("proposal")}
        >
          View proposed changes →
        </button>
      </div>
    </div>
  );
}
