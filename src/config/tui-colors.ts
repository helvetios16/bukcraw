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
  SUCCESS: "#66bb6a", // Softer green
  ERROR: "#ef5350", // Softer red
  WARNING: "#ffee58", // Softer yellow
  INFO: "#42a5f5", // Softer blue
  PRIMARY: "#26c6da", // Muted Cyan
  SECONDARY: "#78909c", // Blue-grey
  TEXT_BRIGHT: "#eeeeee",
  TEXT: "#b0bec5", // Blue-grey text
  TEXT_DIM: "#546e7a", // Darker blue-grey
  BORDER: "#455a64", // Dark border
  BACKGROUND_ICON: "#37474f",
} as const;
