import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DumbbellChart } from "./DumbbellChart";

describe("DumbbellChart", () => {
  it("renders today and after dots positioned by minutes over the axis max", () => {
    render(
      <DumbbellChart
        todayMinutes={22}
        afterMinutes={41}
        axisMaxMinutes={50}
        tone="worse"
        staggerIndex={0}
      />,
    );
    const today = screen.getByTestId("dumbbell-today-dot");
    const after = screen.getByTestId("dumbbell-after-dot");
    // 22/50 = 44%, offset by half the dot's own width (5px) as the wireframe does
    expect(today.style.left).toBe("calc(44% - 5px)");
    // After starts at the after position per its inline style target,
    // but renders at the today position until mounted — checked via the
    // CSS custom property, not the live `left` value (that's animated by
    // useEffect + CSS transition, not easily assertable in jsdom).
    expect(after.style.getPropertyValue("--dumbbell-to")).toBe(
      "calc(82% - 5px)",
    );
  });

  it("clamps minutes above the axis max to 100%", () => {
    render(
      <DumbbellChart
        todayMinutes={10}
        afterMinutes={999}
        axisMaxMinutes={50}
        tone="worse"
        staggerIndex={0}
      />,
    );
    expect(
      screen
        .getByTestId("dumbbell-after-dot")
        .style.getPropertyValue("--dumbbell-to"),
    ).toBe("calc(100% - 5px)");
  });
});
