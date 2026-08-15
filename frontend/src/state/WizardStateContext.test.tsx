import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWizardState, WizardStateProvider } from "./WizardStateContext";
import { emptyWizardState, loadWizardState } from "./wizardState";

function Probe() {
  const { wizard, setWizard } = useWizardState();
  return (
    <button
      type="button"
      onClick={() => setWizard({ ...wizard, cityId: "christchurch" })}
    >
      cityId: {wizard.cityId ?? "none"}
    </button>
  );
}

describe("WizardStateProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("initializes from localStorage and persists updates", () => {
    render(
      <WizardStateProvider>
        <Probe />
      </WizardStateProvider>,
    );
    expect(screen.getByText("cityId: none")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("cityId: christchurch")).toBeInTheDocument();
    expect(loadWizardState()).toEqual({
      ...emptyWizardState(),
      cityId: "christchurch",
    });
  });
});
