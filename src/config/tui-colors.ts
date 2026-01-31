// src/config/tui-colors.ts

interface TuiColors {
  readonly SUCCESS: string;
  readonly ERROR: string;
  readonly WARNING: string;
  readonly INFO: string;
  readonly PRIMARY: string;
  readonly SECONDARY: string;
  readonly TEXT_BRIGHT: string;
  readonly TEXT: string;
  readonly TEXT_DIM: string;
  readonly BORDER: string;
  readonly BACKGROUND_ICON: string;
}

export const COLORS: TuiColors = {
  SUCCESS: "#00FF00",
  ERROR: "#FF0000",
  WARNING: "#FFFF00",
  INFO: "#00FFFF",
  PRIMARY: "cyan",
  SECONDARY: "gray",
  TEXT_BRIGHT: "white",
  TEXT: "#D3D3D3",
  TEXT_DIM: "gray",
  BORDER: "white",
  BACKGROUND_ICON: "#484343",
} as const;
