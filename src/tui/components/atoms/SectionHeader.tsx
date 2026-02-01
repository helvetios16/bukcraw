import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface SectionHeaderProps {
  readonly title: string;
  readonly align?: "center" | "flex-start" | "flex-end";
}

export function SectionHeader({ title, align = "center" }: SectionHeaderProps): ReactNode {
  return (
    <box alignItems={align} width="100%" marginBottom={1}>
      <text fg={COLORS.PRIMARY}>{title}</text>
    </box>
  );
}
