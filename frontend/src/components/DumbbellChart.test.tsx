import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DumbbellChart } from "./DumbbellChart";

describe("DumbbellChart", () => {
  it("renders today and after dots positioned by minutes over the axis max", async () => {
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
    // After starts at the today position until mounted (useEffect +
    // requestAnimationFrame flips animateIn), then transitions to its real
    // position via the CSS transition class — confirm it actually gets there.
    await waitFor(() => expect(after.style.left).toBe("calc(82% - 5px)"));
  });

  it("clamps minutes above the axis max to 100%", async () => {
    render(
      <DumbbellChart
        todayMinutes={10}
        afterMinutes={999}
        axisMaxMinutes={50}
        tone="worse"
        staggerIndex={0}
      />,
    );
    const after = screen.getByTestId("dumbbell-after-dot");
    await waitFor(() => expect(after.style.left).toBe("calc(100% - 5px)"));
  });
});
