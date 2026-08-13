import { History, MapPin } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NetworkBackdrop } from "../components/NetworkBackdrop";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Modal } from "../components/ui/modal";
import { type AnalysisSummary, fetchAnalyses } from "../data/analysisCatalogue";
import {
  type GeocodeResult,
  fetchSuggestions,
  forwardGeocode,
} from "../data/geocode";
import { matchingCityIds } from "../data/hexLookup";
import { navigate } from "../router";
import { useWizardState } from "../state/WizardStateContext";
import {
  type HistoryEntry,
  analysisKey,
  historyEntryToWizardState,
  loadHistory,
  pruneHistory,
  saveHistory,
  tripKey,
} from "../state/resultsHistory";
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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsSeq = useRef(0);

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

  // Clears the pending address-suggestion debounce on unmount so it can't
  // fire fetchSuggestions/setState after the component is gone.
  useEffect(() => {
    return () => {
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    };
  }, []);

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

  const proposalTitle =
    wizard.analysisId !== null
      ? (analyses?.find(
          (a) =>
            a.analysisId === wizard.analysisId && a.cityId === wizard.cityId,
        )?.title ??
        featuredEntry?.proposalTitle ??
        null)
      : null;

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
  }

  function selectSuggestion(result: GeocodeResult) {
    setSuggestionsOpen(false);
    setAddress(result.label);
    resolveOrigin(result);
  }

  function scheduleSuggestions(value: string) {
    if (debounceTimer.current !== null) clearTimeout(debounceTimer.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      const seq = ++suggestionsSeq.current;
      fetchSuggestions(value).then((results) => {
        if (seq !== suggestionsSeq.current) return;
        setSuggestions(results);
        setSuggestionsOpen(results.length > 0);
      });
    }, 400);
  }

  function handleAddressChange(value: string) {
    setAddress(value);
    setCheckError(false);
    scheduleSuggestions(value);
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
      <div className="relative mt-1.5">
        <div className="absolute left-0 top-0 z-10 max-h-[240px] w-full overflow-y-auto rounded-md border border-kotare-grey bg-surface-card shadow-sm">
          {otherEntries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="sd-focus w-full border-b border-kotare-grey/50 px-3 py-2 text-left last:border-b-0 hover:bg-kotare-blue/[0.06]"
              onClick={() => resumeToHistoryEntry(entry)}
            >
              <div className="text-[12px] font-semibold text-ink">
                {entry.proposalTitle} — {entry.cityName}
              </div>
              <div className="font-mono text-[10px] text-ink-soft">
                {new Date(entry.savedAt).toLocaleDateString()} ·{" "}
                {entry.changedCount === 0
                  ? "no change"
                  : `${entry.changedCount} of ${entry.destinationCount} trips change`}
              </div>
            </button>
          ))}
        </div>
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
                    ? "Your last check"
                    : "Continue where you left off"}
                </span>
              </div>
              <div className="mb-0.5 text-[13.5px] font-bold text-ink">
                {proposalTitle ?? "Choosing a proposal"}
              </div>
              <div className="mb-3 text-[12px] text-ink-soft">
                {resumeTo === "results" && featuredEntry
                  ? `${featuredEntry.destinationCount} destinations · ${featuredEntry.changedCount} of ${featuredEntry.destinationCount} trips change`
                  : resumeTo === "results"
                    ? `${wizard.destinations.length} destinations`
                    : `${wizard.destinations.length} of 5 destinations added`}
              </div>
              <Button className="w-full" onClick={() => navigate(resumeTo)}>
                Resume
              </Button>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="sd-focus text-[12px] font-medium text-ink-soft hover:text-ink"
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
                      See your other previous results
                    </button>
                  </>
                )}
              </div>
              {historyPopover()}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-stretch gap-2">
                <div className="relative min-w-0 flex-1">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <Input
                    aria-label="Home address"
                    className="pl-9 pr-3"
                    placeholder="Enter your home address"
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCheck();
                    }}
                  />
                  {suggestionsOpen && (
                    <div className="absolute left-0 top-full z-10 mt-1.5 max-h-[240px] w-full overflow-y-auto rounded-md border border-kotare-grey bg-surface-card shadow-sm">
                      {suggestions.map((s) => (
                        <button
                          key={`${s.lat},${s.lng}`}
                          type="button"
                          className="sd-focus block w-full border-b border-kotare-grey/50 px-3 py-2 text-left text-[12.5px] last:border-b-0 hover:bg-kotare-blue/[0.06]"
                          onClick={() => selectSuggestion(s)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={handleCheck} disabled={checking}>
                  Check
                </Button>
              </div>
              {checkError && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[12px] text-kotare-brown">
                    No address found — check the spelling.
                  </p>
                  <button
                    type="button"
                    className="sd-focus text-[12px] font-semibold text-kotare-blue hover:text-kotare-navy"
                    onClick={() => navigate("proposal", "?city=")}
                  >
                    Or continue without checking your address →
                  </button>
                </div>
              )}
              {otherEntries.length > 0 && (
                <div className="mb-3">
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
            className="sd-focus mt-4 block text-[12.5px] font-semibold text-kotare-blue hover:text-kotare-navy"
            onClick={() => navigate("proposal", "?city=")}
          >
            View proposed changes →
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
