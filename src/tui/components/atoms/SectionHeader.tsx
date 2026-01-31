import type { ReactNode } from "react";

interface SectionHeaderProps {
  readonly title: string;
}

export function SectionHeader({ title }: SectionHeaderProps): ReactNode {
  return (
    <box alignItems="center" width="100%" marginBottom={1}>
      <text>{title}</text>
    </box>
  );
}
