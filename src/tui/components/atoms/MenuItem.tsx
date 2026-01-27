import type { JSX } from "react";
import { COLORS } from "../../../config/tui-colors";

interface MenuItemProps {
  readonly label: string;
  readonly isSelected: boolean;
}

export function MenuItem({ label, isSelected }: MenuItemProps): JSX.Element {
  return (
    <box paddingRight={1}>
      <text fg={isSelected ? COLORS.PRIMARY : COLORS.TEXT_BRIGHT} bold={isSelected}>
        {isSelected ? "> " : "  "}
        {label}
      </text>
    </box>
  );
}
