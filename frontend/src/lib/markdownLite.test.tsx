import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderMarkdownLite, stripMarkdownLite } from "./markdownLite";

describe("renderMarkdownLite", () => {
  it("renders one paragraph per blank-line-separated block", () => {
    const { container } = render(
      <div>{renderMarkdownLite("First paragraph.\n\nSecond paragraph.")}</div>,
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("renders an image, a link and bold text", () => {
    const { container } = render(
      <div>
        {renderMarkdownLite(
          "See [this page](https://example.org) — **important** ![alt text](https://example.org/img.png)",
        )}
      </div>,
    );
    expect(container.querySelector("a")).toHaveAttribute(
      "href",
      "https://example.org",
    );
    expect(container.querySelector("strong")).toHaveTextContent("important");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.org/img.png",
    );
  });
});

describe("stripMarkdownLite", () => {
  it("removes markdown syntax leaving plain, collapsed text", () => {
    expect(
      stripMarkdownLite(
        "See [this page](https://example.org)\n\n**important** ![alt](https://x/y.png)",
      ),
    ).toBe("See this page important");
  });
});
