import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface MenuItemProps {
  readonly label: string;
  readonly isSelected: boolean;
}

export function MenuItem({ label, isSelected }: MenuItemProps): ReactNode {
  return (
    <box paddingRight={1}>
      <text fg={isSelected ? COLORS.PRIMARY : COLORS.TEXT_BRIGHT}>
        {isSelected ? "> " : "  "}
        {label}
      </text>
    </box>
  );
}
