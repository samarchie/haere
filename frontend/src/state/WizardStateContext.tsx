import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  type WizardState,
  clearWizardState,
  emptyWizardState,
  loadWizardState,
  saveWizardState,
} from "./wizardState";

interface WizardStateContextValue {
  wizard: WizardState;
  setWizard: (next: WizardState) => void;
  resetWizard: () => void;
}

const WizardStateContext = createContext<WizardStateContextValue | null>(null);

export function WizardStateProvider({ children }: { children: ReactNode }) {
  const [wizard, setWizardRaw] = useState<WizardState>(
    () => loadWizardState() ?? emptyWizardState(),
  );

  const setWizard = useCallback((next: WizardState) => {
    saveWizardState(next);
    setWizardRaw(next);
  }, []);

  const resetWizard = useCallback(() => {
    clearWizardState();
    setWizardRaw(emptyWizardState());
  }, []);

  const value = useMemo(
    () => ({ wizard, setWizard, resetWizard }),
    [wizard, setWizard, resetWizard],
  );

  return (
    <WizardStateContext.Provider value={value}>
      {children}
    </WizardStateContext.Provider>
  );
}

export function useWizardState(): WizardStateContextValue {
  const ctx = useContext(WizardStateContext);
  if (!ctx) {
    throw new Error("useWizardState must be used within a WizardStateProvider");
  }
  return ctx;
}
