import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WizardShell } from "./WizardShell";

describe("WizardShell", () => {
  it("shows the step label, title, and fills segments up to the current step", () => {
    render(
      <WizardShell step={2} title="Your addresses">
        <p>content</p>
      </WizardShell>,
    );
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Your addresses")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();

    const segments = screen.getByTestId("wizard-progress").children;
    expect(segments).toHaveLength(3);
    expect(segments[0].className).toContain("bg-kotare-navy");
    expect(segments[1].className).toContain("bg-kotare-navy");
    expect(segments[2].className).toContain("bg-kotare-grey");
  });
});
