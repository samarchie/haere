import { describe, expect, it, vi } from "vitest";
import { el, mount } from "./dom";

describe("el", () => {
  it("creates an element with the given tag", () => {
    const node = el("p");
    expect(node.tagName).toBe("P");
  });

  it("sets a class prop via className", () => {
    const node = el("div", { class: "card" });
    expect(node.className).toBe("card");
  });

  it("sets arbitrary string attributes", () => {
    const node = el("a", { href: "https://example.com" });
    expect(node.getAttribute("href")).toBe("https://example.com");
  });

  it("sets disabled only when the value is truthy", () => {
    const disabled = el("button", { disabled: true });
    const enabled = el("button", { disabled: false });
    expect(disabled.hasAttribute("disabled")).toBe(true);
    expect(enabled.hasAttribute("disabled")).toBe(false);
  });

  it("attaches an onclick handler", () => {
    const handler = vi.fn();
    const node = el("button", { onclick: handler });
    node.dispatchEvent(new MouseEvent("click"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("appends string and element children, skipping null/undefined/false", () => {
    const child = el("span");
    const node = el("div", {}, "text", child, null, undefined, false);
    expect(node.childNodes).toHaveLength(2);
    expect(node.textContent).toBe("text");
    expect(node.children[0]).toBe(child);
  });
});

describe("mount", () => {
  it("replaces the root's children with the given nodes", () => {
    const root = document.createElement("div");
    root.append(document.createElement("span"));

    mount(root, el("p", {}, "hello"));

    expect(root.children).toHaveLength(1);
    expect(root.textContent).toBe("hello");
  });
});
