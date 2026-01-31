import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface MenuItemProps {
  readonly label: string;
  readonly isSelected: boolean;
}

export function MenuItem({ label, isSelected }: MenuItemProps): ReactNode {
  const color = isSelected ? COLORS.PRIMARY : COLORS.TEXT_BRIGHT;
  return (
    <box flexDirection="row">
      <text fg={color}>{isSelected ? "> " : "  "}</text>
      <text fg={color}>{label}</text>
      <text> </text>
    </box>
  );
}
