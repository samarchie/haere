import { ChevronRight, History, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { NetworkBackdrop } from "../components/NetworkBackdrop";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { type AnalysisSummary, fetchAnalyses } from "../data/analysisCatalogue";
import { forwardGeocode, type GeocodeResult } from "../data/geocode";
import { matchingCityIds } from "../data/hexLookup";
import { fetchManifest } from "../data/manifest";
import { useDocumentHead } from "../lib/useDocumentHead";
import { navigate } from "../router";
import {
  analysisKey,
  type HistoryEntry,
  historyEntryToWizardState,
  loadHistory,
  pruneHistory,
  saveHistory,
  tripKey,
} from "../state/resultsHistory";
import { useWizardState } from "../state/WizardStateContext";
import type { WizardState } from "../state/wizardState";

export function hasResumableProgress(
  state: WizardState,
  liveAnalysisIds: Set<string> | null,
): boolean {
  const chosenAnalysisIsLive =
    state.analysisId === null ||
    state.cityId === null ||
    liveAnalysisIds === null ||
    liveAnalysisIds.has(analysisKey(state.cityId, state.analysisId));

  if (!chosenAnalysisIsLive) {
    return false;
  }

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
  useDocumentHead({
    title: "haere",
    description:
      "Check your own address to see exactly how your trips change under a proposed public transport network.",
    path: "/",
  });
  const { wizard, setWizard, resetWizard } = useWizardState();
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null);
  const liveAnalysisIds = useMemo(
    () =>
      analyses === null
        ? null
        : new Set(analyses.map((a) => analysisKey(a.cityId, a.analysisId))),
    [analyses],
  );
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const [address, setAddress] = useState("");
  const [point, setPoint] = useState<GeocodeResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);

  // Runs once on mount to reconcile stored progress/history against the
  // live proposal catalogue — wizard/resetWizard are read via closure here
  // intentionally, matching the pattern already used in Location.tsx.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only by design.
  useEffect(() => {
    let cancelled = false;
    fetchAnalyses()
      .then((fetched) => {
        if (cancelled) return;
        const live = new Set(
          fetched.map((a) => analysisKey(a.cityId, a.analysisId)),
        );
        setAnalyses(fetched);

        if (
          wizard.analysisId !== null &&
          wizard.cityId !== null &&
          !live.has(analysisKey(wizard.cityId, wizard.analysisId))
        ) {
          resetWizard();
        }

        const pruned = pruneHistory(history, live);
        setHistory(pruned);
        if (pruned.length !== history.length) saveHistory(pruned);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (!historyRef.current?.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  const resumable = hasResumableProgress(wizard, liveAnalysisIds);
  const resumeTo = resumeScreen(wizard);

  const activeTripKey =
    wizard.cityId !== null &&
    wizard.analysisId !== null &&
    wizard.origin !== null
      ? tripKey(wizard.cityId, wizard.analysisId, wizard.origin.address)
      : null;
  const featuredEntry =
    resumeTo === "results" && activeTripKey !== null
      ? (history.find(
          (h) =>
            tripKey(h.cityId, h.analysisId, h.origin.address) === activeTripKey,
        ) ?? null)
      : null;
  const otherEntries = history.filter((h) => h.id !== featuredEntry?.id);

  const [inProgressTitle, setInProgressTitle] = useState<string | null>(null);
  // Fetches only the one manifest for the proposal the user already chose,
  // so the resume banner can show its real title instead of a placeholder.
  useEffect(() => {
    if (
      resumeTo !== "location" ||
      wizard.cityId === null ||
      wizard.analysisId === null
    ) {
      setInProgressTitle(null);
      return;
    }
    let cancelled = false;
    fetchManifest(wizard.cityId, wizard.analysisId)
      .then((manifest) => {
        if (!cancelled) setInProgressTitle(manifest.analysis.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumeTo, wizard.cityId, wizard.analysisId]);

  const proposalTitle =
    wizard.analysisId === null
      ? null
      : resumeTo === "results"
        ? (featuredEntry?.proposalTitle ?? null)
        : inProgressTitle;

  async function resolveOrigin(result: GeocodeResult) {
    setWizard({
      ...wizard,
      origin: { address: result.label, lat: result.lat, lng: result.lng },
    });
    // No proposal is chosen yet, so this checks every proposal in every
    // city — a wider net than the wizard's own city-scoped sibling check
    // (Location.tsx's resolveOriginRouting). analyses === null means the
    // catalogue hasn't loaded yet; fail open rather than block on it.
    if (analyses === null) {
      navigate("proposal");
      return;
    }
    try {
      const cities = await matchingCityIds(result.lat, result.lng, analyses);
      if (cities.size === 0) {
        navigate("proposal", "?city=&reason=outside-area");
      } else if (cities.size === 1) {
        const [cityId] = cities;
        navigate("proposal", `?city=${encodeURIComponent(cityId)}`);
      } else {
        // Matches proposals in more than one city — too ambiguous to filter
        // to just one, so show the whole wall same as an unresolved address.
        navigate("proposal");
      }
    } catch {
      // The area lookup failed (network blip) after the address itself
      // resolved fine — fail open to the unfiltered wall rather than get
      // stuck, same as the analyses === null case above.
      navigate("proposal");
    }
  }

  function handleResolve(result: GeocodeResult) {
    setPoint(result);
    setAddress(result.label);
    resolveOrigin(result);
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    setCheckError(false);
  }

  async function handleCheck() {
    if (checking || address.trim().length === 0) return;
    setChecking(true);
    setCheckError(false);
    const outcome = await forwardGeocode(address);
    if (!outcome.ok) {
      setChecking(false);
      setCheckError(true);
      return;
    }
    await resolveOrigin(outcome.result);
    setChecking(false);
  }

  function resumeToHistoryEntry(entry: HistoryEntry) {
    setHistoryOpen(false);
    setWizard(historyEntryToWizardState(entry));
    navigate("results");
  }

  function historyPopover() {
    if (!historyOpen || otherEntries.length === 0) return null;
    return (
      <div className="absolute left-0 top-full z-10 mt-1.5 max-h-[240px] w-full overflow-y-auto rounded-md border border-kotare-grey bg-surface-card shadow-sm">
        {otherEntries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className="sd-focus w-full border-b border-kotare-grey/50 px-3 py-2 text-left last:border-b-0 hover:bg-kotare-blue/[0.06]"
            onClick={() => resumeToHistoryEntry(entry)}
          >
            <div className="text-[12px] font-semibold text-ink">
              {entry.proposalTitle} · {entry.origin.address}
            </div>
            <div className="font-mono text-[10px] text-ink-soft">
              {new Date(entry.savedAt).toLocaleDateString()} ·{" "}
              {entry.changedCount === 0
                ? `no change in the ${entry.destinationCount} trips`
                : `${entry.changedCount} of ${entry.destinationCount} trips change`}
            </div>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[920px] items-center justify-center">
      <NetworkBackdrop />
      <div className="relative z-[1] w-full max-w-[440px] rounded-2xl border border-kotare-grey bg-surface-card shadow-xl shadow-kotare-blue/10">
        <div
          className="relative rounded-t-2xl px-6 pt-10 pb-8 sm:px-9 sm:pt-12 sm:pb-10"
          style={{
            background:
              "radial-gradient(140% 100% at 10% -25%, rgba(var(--kotare-blue-rgb), .32), transparent 65%), var(--surface-card)",
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
                {resumeTo === "results" ? (
                  <History className="h-3.5 w-3.5 text-kotare-blue" />
                ) : (
                  <MapPin className="h-3.5 w-3.5 text-kotare-blue" />
                )}
                <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-kotare-navy">
                  {resumeTo === "results"
                    ? "Your last result"
                    : "Continue where you left off"}
                </span>
              </div>
              <div className="mb-3 text-[13.5px] text-ink">
                <span className="font-bold">
                  {proposalTitle ?? "Choosing a proposal"}
                </span>
                <span className="text-ink-soft">
                  {" "}
                  ·{" "}
                  {resumeTo === "results" && featuredEntry
                    ? `${featuredEntry.origin.address} · ${featuredEntry.changedCount} of ${featuredEntry.destinationCount} trips change`
                    : resumeTo === "results" && wizard.origin?.address
                      ? `${wizard.origin.address} · ${wizard.destinations.length} destinations`
                      : resumeTo === "results"
                        ? `${wizard.destinations.length} destinations`
                        : `${wizard.destinations.length} of 5 destinations added`}
                </span>
              </div>
              <Button className="w-full" onClick={() => navigate(resumeTo)}>
                Resume <ChevronRight className="h-4 w-4" />
              </Button>
              <div className="relative" ref={historyRef}>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="sd-focus text-[12px] font-semibold text-kotare-blue hover:text-kotare-navy"
                    onClick={resetWizard}
                  >
                    Start over
                  </button>
                  {otherEntries.length > 0 && (
                    <>
                      <span aria-hidden="true" className="text-kotare-grey">
                        ·
                      </span>
                      <button
                        type="button"
                        className="sd-focus text-[12px] font-semibold text-kotare-blue hover:text-kotare-navy"
                        aria-expanded={historyOpen}
                        onClick={() => setHistoryOpen((open) => !open)}
                      >
                        See other results
                      </button>
                    </>
                  )}
                </div>
                {historyPopover()}
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <AddressAutocomplete
                    id="home-address"
                    label="Home address"
                    value={address}
                    point={point}
                    onChange={handleAddressChange}
                    onResolve={handleResolve}
                    onSearchSettled={() => {}}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCheck();
                    }}
                  />
                </div>
                <Button onClick={handleCheck} disabled={checking}>
                  Check <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              {checkError && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[12px] text-kotare-brown">
                    No address found — check the spelling.
                  </p>
                  <button
                    type="button"
                    className="sd-focus inline-flex items-center gap-1 text-[12px] font-semibold text-kotare-blue hover:text-kotare-navy"
                    onClick={() => navigate("proposal", "?city=")}
                  >
                    Or continue without checking your address
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
              {otherEntries.length > 0 && (
                <div className="relative mb-3" ref={historyRef}>
                  <button
                    type="button"
                    className="sd-focus text-[12px] font-semibold text-kotare-blue hover:text-kotare-navy"
                    aria-expanded={historyOpen}
                    onClick={() => setHistoryOpen((open) => !open)}
                  >
                    See your other previous results
                  </button>
                  {historyPopover()}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            className="sd-focus mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-kotare-blue hover:text-kotare-navy"
            onClick={() => navigate("proposal", "?city=")}
          >
            View proposed changes
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-5 rounded-b-2xl border-t border-kotare-grey/50 bg-kotare-grey/10 px-6 py-3 sm:px-9">
          <button
            type="button"
            className="sd-focus text-[11px] text-ink-soft hover:text-ink"
            onClick={() => setAboutOpen(true)}
          >
            About this analysis
          </button>
          <button
            type="button"
            className="sd-focus text-[11px] text-ink-soft hover:text-ink"
            onClick={() => setPrivacyOpen(true)}
          >
            Privacy
          </button>
        </div>
      </div>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="About this analysis"
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          haere is an independent tool for checking how a proposed transport
          network change affects your own trips — it isn't run by your local
          transport authority, and using it doesn't submit anything to a
          consultation. Results are haere's own modelled estimate from public
          timetable data, not an official guarantee. No account is needed, and
          nothing you enter is sold or shared.
        </p>
      </Modal>
      <Modal
        open={privacyOpen}
        onClose={() => setPrivacyOpen(false)}
        title="Privacy"
      >
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Your address, destinations, and saved results stay in this browser's
          local storage — they're never sent to a server except for the one-off
          address lookup and results computation needed to answer your question.
          There's no account, no analytics, and no tracking.
        </p>
      </Modal>
    </div>
  );
}
