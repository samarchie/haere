export type Child = Node | string | null | undefined | false;

export type Props = Record<string, string | boolean | ((e: Event) => void)>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === "class" && typeof value === "string") {
      node.className = value;
    } else if (key === "disabled") {
      if (value) {
        node.setAttribute("disabled", "");
      }
    } else if (typeof value === "string") {
      node.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child);
  }

  return node;
}

export function mount(root: HTMLElement, ...children: Child[]): void {
  root.replaceChildren();
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    root.append(child);
  }
}
