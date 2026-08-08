import type { Screen } from "../router";

export interface AnchorConfig {
  camNode: string;
  anchorNode: string;
  targetMesh: string;
}

const EINK: AnchorConfig = {
  camNode: "Cam_Eink",
  anchorNode: "Anchor_Eink",
  targetMesh: "kiosk_screen",
};

export const ANCHORS: Record<Screen, AnchorConfig> = {
  landing: {
    camNode: "Cam_Landing",
    anchorNode: "Anchor_Landing",
    targetMesh: "poster_prop",
  },
  picker: {
    camNode: "Cam_ProposalWall",
    anchorNode: "Anchor_ProposalWall",
    targetMesh: "PosterWallSlots",
  },
  location: EINK,
  scenario: EINK,
  results: EINK,
};

export function anchorFor(screen: Screen): AnchorConfig {
  return ANCHORS[screen];
}
