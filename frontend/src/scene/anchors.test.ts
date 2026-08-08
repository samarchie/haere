import { describe, expect, it } from "vitest";
import { ANCHORS, anchorFor } from "./anchors";

describe("anchorFor", () => {
  it("maps every screen to the node triple present in bus_stop_new.glb", () => {
    expect(anchorFor("landing")).toEqual({
      camNode: "Cam_Landing",
      anchorNode: "Anchor_Landing",
      targetMesh: "poster_prop",
    });
    expect(anchorFor("picker")).toEqual({
      camNode: "Cam_ProposalWall",
      anchorNode: "Anchor_ProposalWall",
      targetMesh: "PosterWallSlots",
    });
    expect(anchorFor("location")).toEqual({
      camNode: "Cam_Eink",
      anchorNode: "Anchor_Eink",
      targetMesh: "kiosk_screen",
    });
  });

  it("shares one anchor across all three eink wizard steps", () => {
    expect(ANCHORS.location).toEqual(ANCHORS.scenario);
    expect(ANCHORS.scenario).toEqual(ANCHORS.results);
  });
});
