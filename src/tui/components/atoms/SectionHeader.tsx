import type { ReactNode } from "react";
import { COLORS } from "../../../config/tui-colors";

interface SectionHeaderProps {
  readonly title: string;
}

export function SectionHeader({ title }: SectionHeaderProps): ReactNode {
  return (
    <box alignItems="center" width="100%" marginBottom={1}>
      <text fg={COLORS.PRIMARY}>{title}</text>
    </box>
  );
}
