import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  clearWizardState,
  emptyWizardState,
  loadWizardState,
  saveWizardState,
  type WizardState,
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

  const value = { wizard, setWizard, resetWizard };

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
