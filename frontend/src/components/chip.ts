import { el } from "../dom";

export function renderChip(
  label: string,
  selected: boolean,
  onClick: () => void,
  options?: { disabled?: boolean; title?: string },
): HTMLElement {
  return el(
    "button",
    {
      class: selected ? "chip selected" : "chip",
      type: "button",
      disabled: options?.disabled ?? false,
      title: options?.title ?? "",
      onclick: onClick,
    },
    label,
  );
}
