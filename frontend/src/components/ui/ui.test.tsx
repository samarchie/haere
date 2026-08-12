import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { ToggleGroup } from "./toggle-group";

describe("Button", () => {
  it("fires onClick and applies the primary variant classes by default", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Check</Button>);
    const button = screen.getByRole("button", { name: "Check" });
    expect(button.className).toContain("bg-kotare-navy");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies outline variant classes when requested", () => {
    render(<Button variant="outline">Learn more</Button>);
    expect(
      screen.getByRole("button", { name: "Learn more" }).className,
    ).toContain("border-kotare-blue");
  });
});

describe("Badge", () => {
  it("renders the tone's background color", () => {
    render(<Badge tone="teal">Faster</Badge>);
    expect(screen.getByText("Faster").className).toContain("bg-kotare-teal");
  });
});

describe("ToggleGroup", () => {
  it("calls onValueChange with the clicked option's value", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup
        aria-label="City filter"
        options={[
          { value: "", label: "All cities" },
          { value: "christchurch", label: "Christchurch" },
        ]}
        value=""
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Christchurch" }));
    expect(onValueChange).toHaveBeenCalledWith("christchurch");
  });

  it("calls onValueChange with an empty string when a configured option's value is empty", () => {
    const onValueChange = vi.fn();
    render(
      <ToggleGroup
        aria-label="City filter"
        options={[
          { value: "", label: "All cities" },
          { value: "christchurch", label: "Christchurch" },
        ]}
        value="christchurch"
        onValueChange={onValueChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "All cities" }));
    expect(onValueChange).toHaveBeenCalledWith("");
  });
});
