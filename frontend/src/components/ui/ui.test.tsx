import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./badge";
import { Button } from "./button";
import { Modal } from "./modal";
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

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="About">
        <p>Body copy</p>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="About">
        <p>Body copy</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByText("Body copy")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="About">
        <p>Body copy</p>
      </Modal>,
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="About">
        <p>Body copy</p>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="About">
        <p>Body copy</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
