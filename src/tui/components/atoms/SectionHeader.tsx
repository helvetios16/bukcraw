import type { JSX } from "react";

interface SectionHeaderProps {
  readonly title: string;
}

export function SectionHeader({ title }: SectionHeaderProps): JSX.Element {
  return (
    <box alignItems="center" width="100%" marginBottom={1}>
      <text bold textAlign="center">
        {title}
      </text>
    </box>
  );
}
